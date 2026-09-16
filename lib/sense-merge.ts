import { normalizeSenseText } from './senses'
import type { EntrySense } from './types'

export interface MergeSensesOptions {
  /** Timestamp written to `removed_at` for senses that vanished. Injectable so tests are stable. */
  now?: string
}

/**
 * Fold a freshly generated sense array into the senses an entry already has (D15).
 *
 * A sense id is permanent: `practice_state.objectives` keys FSRS state as
 * `entry:<id>:sense:<sid>`, so a regenerate that mints a new id for a meaning the entry
 * already had silently strands that state — the objective still exists, but nothing points
 * at it any more and the learner's history for that meaning is invisible. Nothing in the
 * UI or the database would report this, which is why the plan calls it the silent-failure
 * risk of this step.
 *
 * The rules, in order:
 *
 * 1. Returned senses are matched to existing ones by `normalizeSenseText`, so a difference
 *    in case, punctuation or spacing is the same meaning, not a new one.
 * 2. A match keeps the existing `id`, `coverage` and `created_at`. It also keeps `source`
 *    (provenance belongs to the sense, not to the call that restated it) and any example
 *    already generated for it, because a meanings regenerate never carries examples (D10).
 * 3. Only a genuinely new meaning keeps the incoming id.
 * 4. A sense that is not returned is soft-deleted with `removed_at`, never dropped. A
 *    removed sense that comes back is resurrected under its original id.
 *
 * Output order follows the incoming array, with soft-deleted senses last, so the first
 * non-removed element — the primary sense that owns the entry's example columns — is
 * whatever the caller put first.
 */
export function mergeSenses(
  existing: readonly EntrySense[] | null | undefined,
  incoming: readonly EntrySense[] | null | undefined,
  options: MergeSensesOptions = {},
): EntrySense[] {
  const current = [...(existing || [])]
  const candidates = (incoming || []).filter((sense) => sense.text.trim())

  // An empty result means the generation failed, not that the learner has no meanings left.
  // Soft-deleting everything here would empty `translation` through the sync trigger.
  if (!candidates.length) return current

  const now = options.now || new Date().toISOString()

  const byText = new Map<string, number[]>()
  current.forEach((sense, index) => {
    const key = normalizeSenseText(sense.text)
    if (!key) return
    const bucket = byText.get(key)
    if (bucket) bucket.push(index)
    else byText.set(key, [index])
  })
  // Prefer matching a live sense over a soft-deleted one with the same text.
  for (const bucket of byText.values()) {
    bucket.sort((left, right) => Number(Boolean(current[left].removed_at)) - Number(Boolean(current[right].removed_at)))
  }

  const merged: EntrySense[] = []
  const claimed = new Set<number>()
  const seen = new Set<string>()

  for (const candidate of candidates) {
    const text = candidate.text.trim()
    const key = normalizeSenseText(text)
    // Two returned senses that normalize to one meaning must not both claim the same id.
    if (!key || seen.has(key)) continue
    seen.add(key)

    const matchIndex = (byText.get(key) || []).find((index) => !claimed.has(index))
    if (matchIndex === undefined) {
      merged.push({ ...candidate, text, removed_at: null })
      continue
    }

    claimed.add(matchIndex)
    const match = current[matchIndex]
    merged.push({
      ...candidate,
      text,
      id: match.id,
      coverage: { ...match.coverage },
      created_at: match.created_at,
      source: match.source,
      example: candidate.example ?? match.example,
      example_translation: candidate.example_translation ?? match.example_translation,
      note: candidate.note ?? match.note,
      removed_at: null,
    })
  }

  current.forEach((sense, index) => {
    if (claimed.has(index)) return
    merged.push({ ...sense, removed_at: sense.removed_at || now })
  })

  return merged
}
