import { clozeSentence } from './review'
import { normalizeSenseText } from './senses'
import { senseContentVersion } from './practice-content'
import { senseExample, senseTargetKey, type SenseCandidate } from './practice-senses'
import type { PracticeTask } from './practice'
import type { EntrySense, PartOfSpeech, ReviewItem } from './types'

/**
 * The three interactive exercise kinds from D13, and the distractor selection behind them (D6).
 *
 * Everything here is pure and deterministic: the task is built once, stored in the persisted
 * session queue, and must re-render identically after a reload. Nothing in this module reads the
 * clock, calls a provider, or shuffles without a seed.
 */

/** How many wrong options a cloze shows next to the right one. */
export const CLOZE_DISTRACTOR_COUNT = 3

/** How many unusable extra tiles a word bank gets. Enough to matter, few enough to fit a phone. */
export const WORD_BANK_DISTRACTOR_COUNT = 2

/** Longer than this and the word bank stops being a sentence and starts being a puzzle. */
export const WORD_BANK_MAX_TILES = 12

export interface DistractorEntry {
  id: string
  danish: string
  senses: readonly EntrySense[]
}

export interface DistractorInput {
  /** The Danish surface form that is actually correct. Never returned as a distractor. */
  answer: string
  /** The part of speech to prefer. Null when the sense has not been enriched yet. */
  pos: PartOfSpeech | null
  pool: readonly DistractorEntry[]
  /**
   * Entries the caller wants ranked first — same semantic field, reached through **confirmed**
   * synonym edges only. An unconfirmed edge is a guess nobody accepted, and a guessed distractor
   * teaches a false fact, so `synonymNeighbourIds` must be called with `confirmedOnly: true`.
   */
  preferIds?: readonly string[]
  /**
   * Entries that must never be offered. The caller puts the answer's own confirmed synonyms here:
   * a synonym dropped into a gap may genuinely fit, and marking a correct word wrong is precisely
   * the failure this redesign exists to remove.
   */
  excludeIds?: readonly string[]
  count: number
  /** Any stable string. Same seed, same order — the board survives a reload unchanged. */
  seed: string
}

function normalized(value: string): string {
  return normalizeSenseText(value)
}

/** FNV-1a. Small, dependency-free, and good enough to shuffle a handful of tiles. */
function hash(value: string): number {
  let result = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }
  return result >>> 0
}

/** Deterministic shuffle: the order depends only on the seed and the items themselves. */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  return [...items]
    .map((item, index) => ({ item, key: hash(`${seed}:${index}`) }))
    .sort((a, b) => a.key - b.key || 0)
    .map((entry) => entry.item)
}

function entryParts(senses: readonly EntrySense[]): PartOfSpeech[] {
  return [...new Set(senses.map((sense) => sense.pos).filter((pos): pos is PartOfSpeech => Boolean(pos)))]
}

/**
 * Wrong options drawn from the learner's own vocabulary (D6).
 *
 * Preference order is confirmed-neighbourhood first, then shared part of speech, then anything
 * else that is safe. A distractor from the learner's own words is one they can actually weigh up;
 * a random dictionary word is eliminated on sight and teaches nothing.
 */
export function selectDistractors(input: DistractorInput): string[] {
  const answer = normalized(input.answer)
  const preferred = new Set(input.preferIds || [])
  const excluded = new Set(input.excludeIds || [])
  const scored: { danish: string; score: number; id: string }[] = []
  const seen = new Set<string>([answer])

  for (const entry of input.pool) {
    if (!entry || excluded.has(entry.id)) continue
    const danish = (entry.danish || '').trim()
    const key = normalized(danish)
    if (!key || seen.has(key)) continue
    // A multi-word entry cannot stand in for a single word, and vice versa.
    if (danish.includes(' ') !== input.answer.trim().includes(' ')) continue
    seen.add(key)
    const parts = entryParts(entry.senses || [])
    const samePos = Boolean(input.pos) && parts.includes(input.pos as PartOfSpeech)
    scored.push({ danish, id: entry.id, score: (preferred.has(entry.id) ? 2 : 0) + (samePos ? 1 : 0) })
  }

  const ordered = seededShuffle(scored, input.seed)
    .sort((a, b) => b.score - a.score)
    .map((candidate) => candidate.danish)
  return ordered.slice(0, Math.max(0, input.count))
}

/** The tiles a sentence breaks into. Joining them with single spaces rebuilds it exactly. */
export function sentenceTiles(sentence: string): string[] {
  return sentence.trim().split(/\s+/).filter(Boolean)
}

export interface ExerciseInput {
  candidate: SenseCandidate
  /** Every non-removed sense of the entry, in stored order. The first one is the primary. */
  senses: readonly EntrySense[]
  distractors: readonly string[]
  newTarget: boolean
  /** Reps on the sense objective, used to rotate the exercise kind. */
  reps: number
}

function baseTask(candidate: SenseCandidate, item: ReviewItem): Omit<PracticeTask, 'kind' | 'prompt' | 'answer' | 'hint'> {
  const entry = item.vocabulary_entries
  return {
    id: `${candidate.targetKey}:0`,
    targetKey: candidate.targetKey,
    entryId: entry.id,
    objective: 'production',
    stage: 'build',
    danish: entry.danish,
    translation: candidate.sense.text,
    example: senseExample(item, candidate.sense, candidate.primary).sentence || entry.danish,
    audioText: null,
    source: 'saved',
    newTarget: false,
    retry: 0,
    senseId: candidate.sense.id,
    contentVersion: senseContentVersion(entry, candidate.sense),
  }
}

/** Tap the tiles that build the Danish sentence from its meaning (D13 word bank). */
export function assembleTask(input: ExerciseInput): PracticeTask | null {
  const { candidate } = input
  const item = candidate.item
  const example = senseExample(item, candidate.sense, candidate.primary)
  const tiles = sentenceTiles(example.sentence)
  if (tiles.length < 3 || tiles.length > WORD_BANK_MAX_TILES) return null
  const extras = input.distractors
    .filter((word) => !tiles.some((tile) => normalized(tile) === normalized(word)))
    .slice(0, WORD_BANK_DISTRACTOR_COUNT)
  const base = baseTask(candidate, item)
  return {
    ...base,
    id: `${candidate.targetKey}:assemble`,
    kind: 'assemble',
    prompt: example.translation || candidate.sense.text,
    answer: example.sentence,
    answerIsSentence: true,
    hint: `Starts with “${tiles[0]}”.`,
    choices: seededShuffle([...tiles, ...extras], `${candidate.targetKey}:assemble`),
    newTarget: input.newTarget,
  }
}

/** A gapped sentence with options (D13 cloze with choices). */
export function chooseTask(input: ExerciseInput): PracticeTask | null {
  const { candidate } = input
  const item = candidate.item
  const entry = item.vocabulary_entries
  const example = senseExample(item, candidate.sense, candidate.primary)
  const gapped = clozeSentence(example.sentence, entry.danish)
  if (!gapped) return null
  const options = input.distractors.slice(0, CLOZE_DISTRACTOR_COUNT)
  if (!options.length) return null
  const base = baseTask(candidate, item)
  return {
    ...base,
    id: `${candidate.targetKey}:choose`,
    kind: 'choose',
    prompt: gapped,
    answer: entry.danish,
    answerIsSentence: false,
    hint: candidate.sense.text,
    choices: seededShuffle([entry.danish, ...options], `${candidate.targetKey}:choose`),
    newTarget: input.newTarget,
  }
}

/**
 * Two sentences, two senses of the same word, one question: which meaning is in play here (D13)?
 *
 * This is the exercise the whole meaning model exists for. Both sentences are shown, because the
 * discrimination that matters is between concrete uses, not between two glosses in the abstract —
 * seeing the contrasting sentence is what makes the second meaning stick rather than blur into
 * the first. It needs a real contrast, so it returns null unless two senses genuinely have
 * different example sentences.
 */
export function senseTask(input: ExerciseInput): PracticeTask | null {
  const { candidate } = input
  const item = candidate.item
  const senses = input.senses
  if (senses.length < 2) return null
  const mine = senseExample(item, candidate.sense, candidate.primary)
  if (!mine.sentence) return null
  const others = senses.filter((sense) => sense.id !== candidate.sense.id)
  const contrast = others
    .map((sense) => ({ sense, example: senseExample(item, sense, sense.id === senses[0].id) }))
    .find((other) => other.example.sentence && normalized(other.example.sentence) !== normalized(mine.sentence))
  if (!contrast) return null
  const options = senses.map((sense) => sense.text.trim()).filter(Boolean)
  if (new Set(options.map(normalized)).size < 2) return null
  const base = baseTask(candidate, item)
  return {
    ...base,
    id: `${candidate.targetKey}:sense`,
    kind: 'sense',
    objective: 'meaning',
    stage: 'remember',
    prompt: mine.sentence,
    contrast: contrast.example.sentence,
    answer: candidate.sense.text.trim(),
    answerIsSentence: false,
    hint: `“${item.vocabulary_entries.danish}” carries ${options.length} meanings here. Read both sentences before choosing.`,
    choices: seededShuffle(options, `${candidate.targetKey}:sense`),
    newTarget: input.newTarget,
  }
}

/** Unaided typed production of the Danish, the fallback when no interactive board can be built. */
export function produceSenseTask(input: ExerciseInput): PracticeTask {
  const { candidate } = input
  const item = candidate.item
  const entry = item.vocabulary_entries
  const base = baseTask(candidate, item)
  const example = senseExample(item, candidate.sense, candidate.primary)
  return {
    ...base,
    id: `${candidate.targetKey}:produce`,
    kind: 'produce',
    stage: 'remember',
    prompt: candidate.sense.text,
    answer: entry.danish,
    answerIsSentence: entry.entry_kind === 'sentence',
    hint: `${entry.danish.slice(0, 1)}…`,
    example: example.sentence || entry.danish,
    newTarget: input.newTarget,
  }
}

/**
 * The exercise a sense objective gets this time round.
 *
 * The rotation walks from most supported to least: recognise it among options, tell its meaning
 * apart from a sibling's, build the sentence from tiles, then produce it unaided. Only the last
 * one is unaided evidence — the other three carry `assistance: 'choices'` and can never reach
 * `review_cards`. Any kind that lacks the material it needs falls through to the next, so a
 * sense with no example sentence still gets practised.
 */
export function senseExerciseTask(input: ExerciseInput): PracticeTask {
  const builders: ((input: ExerciseInput) => PracticeTask | null)[] = [chooseTask, senseTask, assembleTask, produceSenseTask]
  const start = Math.max(0, Math.trunc(input.reps)) % builders.length
  for (let step = 0; step < builders.length; step += 1) {
    const built = builders[(start + step) % builders.length](input)
    if (built) return built
  }
  return produceSenseTask(input)
}

/** The `entry:<id>:sense:<sid>` key a stored objective belongs to, for planner bookkeeping. */
export function taskSenseKey(task: PracticeTask): string | null {
  if (!task.entryId || !task.senseId) return null
  return senseTargetKey(task.entryId, task.senseId)
}
