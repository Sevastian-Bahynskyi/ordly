import { activeSenses, isNounGender, isPartOfSpeech, parseSenses, PARTS_OF_SPEECH } from './senses'
import type { EntrySense, NounGender, PartOfSpeech } from './types'

/**
 * Phase 2 of the senses migration (D11): AI refinement of part of speech, gender and sense
 * boundaries, on demand and a few entries at a time — never a one-shot mass backfill.
 *
 * Phase 1 split every translation deterministically on `[;,/]` and left `pos` null, marking those
 * senses `source: 'split'`. Refinement is the only thing that ever turns a `'split'` sense into an
 * `'ai'` one, which is also how an entry drops out of the refinement queue.
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

function contiguous(indices: readonly number[]): boolean {
  return indices.every((index, position) => position === 0 || index === indices[position - 1] + 1)
}

/**
 * Fold a refinement into an entry's stored senses (including soft-deleted ones, which pass through).
 *
 * A group is honoured only when every member is a live `'split'` sense, the members are adjacent,
 * and no member was already claimed by an earlier group; otherwise each member is refined on its
 * own. Every live `'split'` sense leaves as `'ai'`, answered or not, so an entry the model could not
 * classify is not retried on every page view.
 */
export function applyRefinement(stored: readonly EntrySense[], meanings: readonly RefinedMeaning[], now: string = new Date().toISOString()): EntrySense[] {
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
        source: 'ai',
      })
    }
  }

  return stored.map((sense) => {
    if (sense.removed_at) return sense
    if (absorbed.has(sense.id)) return { ...sense, removed_at: now }
    const refined = byId.get(sense.id)
    if (refined) return refined
    return sense.source === 'split' ? { ...sense, source: 'ai' as const } : sense
  })
}
