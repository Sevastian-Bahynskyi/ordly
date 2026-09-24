import { senseContentVersion } from './practice-content'
import { seededShuffle, type ExerciseInput } from './practice-exercises'
import { senseExample, type SenseCandidate } from './practice-senses'
import { PILOT_DIALOGUES } from './practice-pilot'
import { normalizeSenseText } from './senses'
import type { PracticeGroupItem, PracticeTask } from './practice'
import type { TranslationLanguage } from './types'

/**
 * Builders for the formats issue #15 adds. Like the older builders, each is pure and seeded: a
 * task is built once, stored in the persisted queue, and re-renders identically after a reload.
 * A builder that lacks safe content returns null, so an unsupported or ambiguous board is simply
 * not offered (spec #12 decision 17).
 */

function hash(value: string): number {
  let result = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }
  return result >>> 0
}

function baseFor(candidate: SenseCandidate): Omit<PracticeTask, 'id' | 'kind' | 'prompt' | 'answer' | 'hint' | 'answerIsSentence'> {
  const entry = candidate.item.vocabulary_entries
  return {
    targetKey: candidate.targetKey,
    entryId: entry.id,
    senseId: candidate.sense.id,
    danish: entry.danish,
    translation: candidate.sense.text,
    example: senseExample(candidate.item, candidate.sense, candidate.primary).sentence || entry.danish,
    contentVersion: senseContentVersion(entry, candidate.sense),
    newTarget: false,
    retry: 0,
  }
}

function groupItem(candidate: SenseCandidate, answer: string): PracticeGroupItem {
  const entry = candidate.item.vocabulary_entries
  return { text: entry.danish, answer, targetKey: candidate.targetKey, entryId: entry.id, senseId: candidate.sense.id, contentVersion: senseContentVersion(entry, candidate.sense) }
}

/** True or false: “X means Y”. The false claim is a meaning no sense of X carries. */
export function binaryTask(input: ExerciseInput): PracticeTask | null {
  const { candidate } = input
  const entry = candidate.item.vocabulary_entries
  if (entry.entry_kind === 'sentence') return null
  const wrong = (input.meaningDistractors || [])[0]
  const claimTrue = !wrong || hash(candidate.targetKey) % 2 === 0
  return {
    ...baseFor(candidate),
    id: `${candidate.targetKey}:binary`,
    kind: 'binary',
    prompt: entry.danish,
    claim: claimTrue ? candidate.sense.text.trim() : wrong,
    answer: claimTrue ? 'true' : 'false',
    answerIsSentence: false,
    hint: '',
    choices: ['true', 'false'],
    newTarget: input.newTarget,
  }
}

/** See the Danish, recall the meaning, reveal it, rate yourself. Self-reported, never checked. */
export function flashTask(input: ExerciseInput): PracticeTask | null {
  const { candidate } = input
  const entry = candidate.item.vocabulary_entries
  return {
    ...baseFor(candidate),
    id: `${candidate.targetKey}:flash`,
    kind: 'flash',
    prompt: entry.danish,
    answer: candidate.sense.text.trim(),
    answerIsSentence: false,
    hint: '',
    newTarget: input.newTarget,
  }
}

/** Two meanings that could both be read as right make a board ambiguous; such a pair is skipped. */
function distinctMeanings(texts: readonly string[]): boolean {
  const keys = texts.map(normalizeSenseText)
  return keys.every((key, index) => key && keys.every((other, at) => at === index || (!other.includes(key) && !key.includes(other))))
}

const GROUP_SIZE = 4

/** Pair each Danish word with its meaning. Needs three to four words with unambiguous meanings. */
export function matchTask(candidates: readonly SenseCandidate[], seed: string): PracticeTask | null {
  const chosen: SenseCandidate[] = []
  for (const candidate of candidates) {
    if (candidate.item.vocabulary_entries.entry_kind === 'sentence') continue
    const danish = candidate.item.vocabulary_entries.danish.trim().toLocaleLowerCase('da-DK')
    if (chosen.some((other) => other.item.vocabulary_entries.danish.trim().toLocaleLowerCase('da-DK') === danish)) continue
    if (!distinctMeanings([...chosen.map((other) => other.sense.text), candidate.sense.text])) continue
    chosen.push(candidate)
    if (chosen.length === GROUP_SIZE) break
  }
  if (chosen.length < 3) return null
  const items = chosen.map((candidate) => groupItem(candidate, candidate.sense.text.trim()))
  return {
    ...baseFor(chosen[0]),
    id: `match:${chosen.map((candidate) => candidate.targetKey).join('|')}`.slice(0, 1900),
    kind: 'match',
    prompt: '',
    answer: '',
    answerIsSentence: false,
    hint: '',
    items: seededShuffle(items, `${seed}:match-left`),
    choices: seededShuffle(items.map((item) => item.answer), `${seed}:match-right`),
  }
}

/** Nouns whose gender the word register recorded, by gender. A noun with no recorded gender is never used. */
function nounsByGender(candidates: readonly SenseCandidate[]): Record<'en' | 'et', SenseCandidate[]> {
  const groups: Record<'en' | 'et', SenseCandidate[]> = { en: [], et: [] }
  const seen = new Set<string>()
  for (const candidate of candidates) {
    const { sense } = candidate
    const danish = candidate.item.vocabulary_entries.danish.trim().toLocaleLowerCase('da-DK')
    if (sense.pos !== 'noun' || (sense.gender !== 'en' && sense.gender !== 'et') || /\s/u.test(danish) || seen.has(danish)) continue
    seen.add(danish)
    groups[sense.gender].push(candidate)
  }
  return groups
}

/** Place each noun under `en` or `et`. Each noun is its own target and gets its own outcome. */
export function sortTask(candidates: readonly SenseCandidate[], seed: string): PracticeTask | null {
  const { en, et } = nounsByGender(candidates)
  if (en.length < 2 || et.length < 2) return null
  const chosen = [...en.slice(0, 3), ...et.slice(0, 3)].slice(0, 6)
  const items = seededShuffle(chosen.map((candidate) => groupItem(candidate, candidate.sense.gender as string)), `${seed}:sort`)
  return {
    ...baseFor(chosen[0]),
    id: `sort:${chosen.map((candidate) => candidate.targetKey).join('|')}`.slice(0, 1900),
    kind: 'sort',
    prompt: '',
    answer: '',
    answerIsSentence: false,
    hint: '',
    categories: ['en', 'et'],
    items,
  }
}

/** Three nouns of one gender and one of the other: tap the odd one. Its gender is the target. */
export function oddTask(candidates: readonly SenseCandidate[], seed: string): PracticeTask | null {
  const { en, et } = nounsByGender(candidates)
  const [many, few] = hash(seed) % 2 === 0 ? [en, et] : [et, en]
  const [common, odd] = many.length >= 3 && few.length >= 1 ? [many, few] : few.length >= 3 && many.length >= 1 ? [few, many] : [[], []]
  if (!odd.length) return null
  const target = odd[0]
  const items = [...common.slice(0, 3), target].map((candidate) => groupItem(candidate, candidate.sense.gender as string))
  return {
    ...baseFor(target),
    id: `odd:${items.map((item) => item.targetKey).join('|')}`.slice(0, 1900),
    kind: 'odd',
    prompt: '',
    answer: target.item.vocabulary_entries.danish,
    answerIsSentence: false,
    hint: '',
    items,
    choices: seededShuffle(items.map((item) => item.text), `${seed}:odd`),
  }
}

/**
 * Prepared exchanges for the learner's saved headwords. Offered only when the situation exists in
 * the learner language; a missing variant makes the exchange ineligible rather than showing it in
 * another language (spec #12 decision 13).
 */
export function dialogueTasks(candidates: readonly SenseCandidate[], locale: TranslationLanguage, seed: string): PracticeTask[] {
  const tasks: PracticeTask[] = []
  for (const dialogue of PILOT_DIALOGUES) {
    const situation = dialogue.situation[locale]
    if (!situation) continue
    const candidate = candidates.find((option) => option.primary && option.item.vocabulary_entries.danish.trim().toLocaleLowerCase('da-DK') === dialogue.headword)
    if (!candidate) continue
    const [answer, ...accepted] = dialogue.accepted
    tasks.push({
      ...baseFor(candidate),
      id: `${candidate.targetKey}:dialogue:${dialogue.id}`,
      kind: 'dialogue',
      prompt: dialogue.line,
      support: situation,
      answer,
      accepted,
      answerIsSentence: true,
      hint: '',
      choices: seededShuffle([...dialogue.accepted, ...dialogue.distractors], `${seed}:${dialogue.id}`),
    })
  }
  return tasks
}
