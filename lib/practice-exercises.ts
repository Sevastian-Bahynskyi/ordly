import { clozeSentence } from './review'
import { normalizeSenseText } from './senses'
import { senseContentVersion } from './practice-content'
import { senseExample, type SenseCandidate } from './practice-senses'
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
  /** Sentences only compete with sentences, words and phrases with each other. */
  sentence?: boolean
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
  /** Wrong meanings for `pick`, in the learner's language. Built by `selectMeaningDistractors`. */
  meaningDistractors?: readonly string[]
  newTarget: boolean
}

function baseTask(candidate: SenseCandidate, item: ReviewItem): Omit<PracticeTask, 'kind' | 'prompt' | 'answer' | 'hint' | 'answerIsSentence'> {
  const entry = item.vocabulary_entries
  return {
    id: `${candidate.targetKey}:0`,
    targetKey: candidate.targetKey,
    entryId: entry.id,
    danish: entry.danish,
    translation: candidate.sense.text,
    example: senseExample(item, candidate.sense, candidate.primary).sentence || entry.danish,
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
  // A gap with one wrong option is a coin toss, not a choice.
  if (options.length < 2) return null
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
    prompt: candidate.sense.text,
    answer: entry.danish,
    answerIsSentence: entry.entry_kind === 'sentence',
    hint: `${entry.danish.slice(0, 1)}…`,
    example: example.sentence || entry.danish,
    newTarget: input.newTarget,
  }
}

/** How many wrong meanings a `pick` board shows next to the right one. */
export const MEANING_DISTRACTOR_COUNT = 3

export interface MeaningDistractorInput {
  /** Every live meaning of the target. None of them may appear as a wrong option. */
  answers: readonly string[]
  pos: PartOfSpeech | null
  sentence: boolean
  pool: readonly DistractorEntry[]
  excludeIds?: readonly string[]
  count: number
  seed: string
}

/**
 * Wrong meanings for a `pick` board, from the learner's own vocabulary.
 *
 * An option that equals or contains one of the target's meanings would be a right answer marked
 * wrong, so it is dropped. Same part of speech and a similar length rank first: a verb among
 * nouns, or one word among long phrases, is eliminated on sight and teaches nothing.
 */
export function selectMeaningDistractors(input: MeaningDistractorInput): string[] {
  const answers = input.answers.map(normalized).filter(Boolean)
  const excluded = new Set(input.excludeIds || [])
  const reference = input.answers[0] || ''
  const seen = new Set<string>(answers)
  const scored: { text: string; score: number }[] = []
  for (const entry of input.pool) {
    if (!entry || excluded.has(entry.id) || Boolean(entry.sentence) !== input.sentence) continue
    const meaning = activeSenseList(entry.senses)[0]
    const text = (meaning?.text || '').trim()
    const key = normalized(text)
    if (!key || seen.has(key) || answers.some((answer) => key.includes(answer) || answer.includes(key))) continue
    seen.add(key)
    const lengthRatio = Math.min(text.length, reference.length) / Math.max(text.length, reference.length, 1)
    const samePos = Boolean(input.pos) && meaning?.pos === input.pos
    scored.push({ text, score: (samePos ? 2 : 0) + (lengthRatio >= 0.6 ? 1 : 0) })
  }
  return seededShuffle(scored, input.seed)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, input.count))
    .map((candidate) => candidate.text)
}

function activeSenseList(senses: readonly EntrySense[]): EntrySense[] {
  return (senses || []).filter((sense) => !sense.removed_at && sense.text?.trim())
}

/**
 * Where a saved word appears in a sentence, allowing for an inflected form.
 *
 * An exact match wins. Otherwise a single word may match a token that starts with its stem and
 * adds a short ending (`spise` → `spiste`, `hyggelig` → `hyggelige`, `bil` → `bilen`). Phrases and
 * irregular forms (`gå` → `gik`) must match exactly, so a gap is never placed on a guess.
 */
export function findInSentence(sentence: string, danish: string): { gapped: string; surface: string } | null {
  const target = danish.trim().replace(/^at\s+/iu, '')
  if (!target || !sentence.trim()) return null
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  const exact = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu').exec(sentence)
  if (exact) return { surface: exact[0], gapped: `${sentence.slice(0, exact.index)}_____${sentence.slice(exact.index + exact[0].length)}` }
  if (/\s/u.test(target)) return null
  const lower = target.toLocaleLowerCase('da-DK')
  const stem = lower.length > 4 && lower.endsWith('e') ? lower.slice(0, -1) : lower
  if (stem.length < 3) return null
  for (const match of sentence.matchAll(/[\p{L}\p{N}]+/gu)) {
    const token = match[0].toLocaleLowerCase('da-DK')
    if (token.startsWith(stem) && token.length - stem.length <= 4) {
      const at = match.index ?? 0
      return { surface: match[0], gapped: `${sentence.slice(0, at)}_____${sentence.slice(at + match[0].length)}` }
    }
  }
  return null
}

/** See the Danish, tap its meaning among four. The warm-up for an item met for the first time. */
export function pickMeaningTask(input: ExerciseInput): PracticeTask | null {
  const { candidate } = input
  const item = candidate.item
  const entry = item.vocabulary_entries
  const options = (input.meaningDistractors || []).slice(0, MEANING_DISTRACTOR_COUNT)
  if (options.length < 2) return null
  const answer = candidate.sense.text.trim()
  const example = senseExample(item, candidate.sense, candidate.primary)
  return {
    ...baseTask(candidate, item),
    id: `${candidate.targetKey}:pick`,
    kind: 'pick',
    prompt: entry.danish,
    answer,
    answerIsSentence: false,
    hint: example.sentence && example.sentence !== entry.danish ? example.sentence : `${answer.slice(0, 1)}…`,
    choices: seededShuffle([answer, ...options], `${candidate.targetKey}:pick`),
    newTarget: input.newTarget,
  }
}

/** Type the missing word into its example sentence, with the sentence's meaning shown (Clozemaster). */
export function clozeTypedTask(input: ExerciseInput): PracticeTask | null {
  const { candidate } = input
  const item = candidate.item
  const entry = item.vocabulary_entries
  if (entry.entry_kind === 'sentence') return sentenceClozeTask(input)
  const example = senseExample(item, candidate.sense, candidate.primary)
  const found = findInSentence(example.sentence, entry.danish)
  if (!found) return null
  return {
    ...baseTask(candidate, item),
    id: `${candidate.targetKey}:cloze`,
    kind: 'cloze',
    prompt: found.gapped,
    answer: found.surface,
    answerIsSentence: false,
    context: example.translation || undefined,
    hint: `Starts with “${found.surface.slice(0, 1)}” · ${[...found.surface].length} letters`,
    newTarget: input.newTarget,
  }
}

/**
 * The longest content word of a saved sentence, gapped. Deterministic, so a reload re-serves the
 * same gap. Short function words are never chosen: a missing `er` is a guessing game.
 */
export function sentenceClozeTask(input: ExerciseInput): PracticeTask | null {
  const { candidate } = input
  const item = candidate.item
  const sentence = item.vocabulary_entries.danish.trim()
  const words = [...sentence.matchAll(/[\p{L}]+/gu)].filter((match) => [...match[0]].length >= 4)
  if (words.length < 2) return null
  const chosen = words.reduce((best, match) => [...match[0]].length > [...best[0]].length ? match : best)
  const at = chosen.index ?? 0
  return {
    ...baseTask(candidate, item),
    id: `${candidate.targetKey}:cloze`,
    kind: 'cloze',
    prompt: `${sentence.slice(0, at)}_____${sentence.slice(at + chosen[0].length)}`,
    answer: chosen[0],
    answerIsSentence: false,
    example: sentence,
    context: candidate.sense.text,
    hint: `Starts with “${chosen[0].slice(0, 1)}” · ${[...chosen[0]].length} letters`,
    newTarget: input.newTarget,
  }
}

/** Build a saved sentence from its own words, shown its meaning. */
export function sentenceAssembleTask(input: ExerciseInput): PracticeTask | null {
  const { candidate } = input
  const item = candidate.item
  const sentence = item.vocabulary_entries.danish.trim()
  const tiles = sentenceTiles(sentence)
  if (tiles.length < 3 || tiles.length > WORD_BANK_MAX_TILES) return null
  const extras = input.distractors
    .filter((word) => !word.includes(' ') && !tiles.some((tile) => normalized(tile) === normalized(word)))
    .slice(0, WORD_BANK_DISTRACTOR_COUNT)
  return {
    ...baseTask(candidate, item),
    id: `${candidate.targetKey}:assemble`,
    kind: 'assemble',
    prompt: candidate.sense.text,
    answer: sentence,
    answerIsSentence: true,
    example: sentence,
    hint: `Starts with “${tiles[0]}”.`,
    choices: seededShuffle([...tiles, ...extras], `${candidate.targetKey}:assemble`),
    newTarget: input.newTarget,
  }
}
