import { corGenderForPos, corPartOfSpeech, type CorForm } from './cor'
import { activeSenses, isNounGender, isPartOfSpeech, parseSenses, PARTS_OF_SPEECH } from './senses'
import type { EntrySense, NounGender, PartOfSpeech } from './types'

/**
 * Phase 2 of the senses migration (D11): refinement of part of speech, gender and sense
 * boundaries, on demand and a few entries at a time — never a one-shot mass backfill.
 *
 * Phase 1 split every translation deterministically on `[;,/]` and left `pos` null, marking those
 * senses `source: 'split'`. Refinement is the only thing that ever turns a `'split'` sense into a
 * `'cor'` or `'ai'` one, which is also how an entry drops out of the refinement queue.
 *
 * The word register answers first (issue #5 §1): where COR's candidates agree, the part of
 * speech and the gender are facts and no model is called; where they do not, the model rules on
 * the part of speech and COR still decides the gender of whatever it called a noun.
 *
 * It is deliberately conservative, because it runs without a preview (AGENTS.md §7, §19):
 *
 * - It never rewrites a meaning. Grammar is only filled in on `'split'` senses; a sense the learner
 *   or the composer already classified is left alone.
 * - A boundary fix may only re-join fragments the comma split broke apart, and only when they are
 *   adjacent `'split'` senses. The fragments are joined with `", "`, exactly as
 *   `translation_from_senses` joins senses, so the entry's `translation` string — the thing review
 *   grades against — is byte-for-byte unchanged.
 * - Absorbed fragments are soft-deleted, never dropped, so their ids stay resolvable (D15).
 */

/** How many entries one page view may send for refinement. Mirrors the icon backfill's pace. */
export const REFINEMENT_BATCH_LIMIT = 4

export interface RefinedMeaning {
  /** 1-based positions in the live sense list sent to the model. More than one means "one meaning". */
  indices: number[]
  pos: PartOfSpeech | null
  gender: NounGender | null
}

export const refinementSchema = {
  type: 'object',
  properties: {
    meanings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          indices: { type: 'array', items: { type: 'integer' } },
          pos: { type: 'string', enum: [...PARTS_OF_SPEECH, ''] },
          gender: { type: 'string', enum: ['en', 'et', ''] },
        },
        required: ['indices', 'pos', 'gender'],
        additionalProperties: false,
      },
    },
  },
  required: ['meanings'],
  additionalProperties: false,
} as const

/** True when an entry still has senses phase 1 split but nobody has classified. */
export function needsRefinement(senses: unknown): boolean {
  return activeSenses(parseSenses(senses)).some((sense) => sense.source === 'split')
}

/** Tolerant reader for the model output. Anything malformed is dropped, not guessed at. */
export function parseRefinedMeanings(value: unknown, senseCount: number): RefinedMeaning[] {
  const meanings = value && typeof value === 'object' ? (value as { meanings?: unknown }).meanings : null
  if (!Array.isArray(meanings)) return []
  const result: RefinedMeaning[] = []
  for (const item of meanings) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const indices = Array.isArray(record.indices)
      ? [...new Set(record.indices.filter((index): index is number => Number.isInteger(index) && index >= 1 && index <= senseCount))].sort((a, b) => a - b)
      : []
    if (!indices.length) continue
    const pos = isPartOfSpeech(record.pos) ? record.pos : null
    result.push({ indices, pos, gender: pos === 'noun' && isNounGender(record.gender) ? record.gender : null })
  }
  return result
}

/**
 * The refinement the word register settles on its own, or null when the model still has to rule.
 *
 * COR answers for the *form*, so one unambiguous reading classifies every meaning of the entry
 * at once and no model call happens at all (issue #5 §1). The cost of skipping the call is that
 * adjacent comma fragments are not re-joined for these entries — the register has no opinion
 * about sense boundaries — which is the trade the issue asks for.
 *
 * A noun whose candidates disagree about gender (`plan`, `alt`) keeps a null gender. It is
 * genuinely both in Danish, so a model would only be guessing; the learner's `en`/`et` chips
 * remain the way to settle it.
 */
export function corRefinement(rows: readonly CorForm[], senseCount: number): RefinedMeaning[] | null {
  const pos = corPartOfSpeech(rows)
  if (!pos || senseCount < 1) return null
  const gender = corGenderForPos(rows, pos)
  return Array.from({ length: senseCount }, (_, index) => ({ indices: [index + 1], pos, gender }))
}

/**
 * Let COR decide the gender of every meaning the model classified as a noun.
 *
 * The model is asked for the part of speech because COR could not settle it; its gender is still
 * only an opinion, so wherever the register is unambiguous the register wins. Where it is not,
 * the model's answer is kept rather than dropped.
 */
export function withCorGender(meanings: RefinedMeaning[], rows: readonly CorForm[]): RefinedMeaning[] {
  const gender = corGenderForPos(rows, 'noun')
  if (!gender) return meanings
  return meanings.map((meaning) => (meaning.pos === 'noun' ? { ...meaning, gender } : meaning))
}

function contiguous(indices: readonly number[]): boolean {
  return indices.every((index, position) => position === 0 || index === indices[position - 1] + 1)
}

/**
 * Fold a refinement into an entry's stored senses (including soft-deleted ones, which pass through).
 *
 * A group is honoured only when every member is a live `'split'` sense, the members are adjacent,
 * and no member was already claimed by an earlier group; otherwise each member is refined on its
 * own. Every live `'split'` sense leaves carrying `source`, answered or not, so an entry the
 * classifier could not settle is not retried on every page view.
 *
 * `source` records who classified the entry: `'ai'` for the model, `'cor'` when the word register
 * settled it without a call. Both leave the refinement queue; only the provenance differs.
 */
export interface RefinementOptions {
  /** The soft-delete timestamp for absorbed fragments. Injected so a test can pin it. */
  now?: string
  source?: 'ai' | 'cor'
}

export function applyRefinement(
  stored: readonly EntrySense[],
  meanings: readonly RefinedMeaning[],
  { now = new Date().toISOString(), source = 'ai' }: RefinementOptions = {},
): EntrySense[] {
  const live = activeSenses(stored)
  const byId = new Map<string, EntrySense>()
  const claimed = new Set<number>()
  const absorbed = new Set<string>()

  for (const meaning of meanings) {
    const members = meaning.indices.map((index) => live[index - 1])
    const groupable = members.length > 1
      && contiguous(meaning.indices)
      && members.every((sense) => sense?.source === 'split')
      && meaning.indices.every((index) => !claimed.has(index))
    const groups = groupable ? [meaning.indices] : meaning.indices.map((index) => [index])

    for (const group of groups) {
      if (group.some((index) => claimed.has(index))) continue
      const [head, ...rest] = group.map((index) => live[index - 1])
      if (!head || head.source !== 'split') continue
      group.forEach((index) => claimed.add(index))
      rest.forEach((sense) => absorbed.add(sense.id))
      byId.set(head.id, {
        ...head,
        text: [head, ...rest].map((sense) => sense.text.trim()).join(', '),
        pos: meaning.pos,
        gender: meaning.pos === 'noun' ? meaning.gender : null,
        source,
      })
    }
  }

  return stored.map((sense) => {
    if (sense.removed_at) return sense
    if (absorbed.has(sense.id)) return { ...sense, removed_at: now }
    const refined = byId.get(sense.id)
    if (refined) return refined
    return sense.source === 'split' ? { ...sense, source } : sense
  })
}
