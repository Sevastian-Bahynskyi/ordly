/**
 * When what is being saved is entered by hand outside the catalog (issue #25), which is when the
 * learner must be told it is checked by nothing and studied in Review only.
 *
 * It mirrors the database rule in `private.mark_unverified_entry`, which is what actually decides
 * `vocabulary_entries.unverified`; this copy only decides what the editor says before saving.
 */

/** Whether the catalog holds what is typed. `miss` covers sentences, which it never holds. */
export type CatalogStatus = 'idle' | 'pending' | 'hit' | 'miss'

export interface ManualEntryInput {
  editing: boolean
  /** The saved entry's own flag; false for a new entry. */
  storedUnverified: boolean
  danishChanged: boolean
  hasDanish: boolean
  catalogLemma: string | null
  catalogStatus: CatalogStatus
  /** The learner has typed a meaning of their own. */
  wroteMeaning: boolean
}

/**
 * `pending` while the catalog is still being asked about a new entry: the answer decides whether
 * the warning is owed, so a save must wait for it rather than slip through unwarned.
 */
export function manualEntryVerdict(input: ManualEntryInput): 'manual' | 'verified' | 'pending' {
  if (input.editing) return input.storedUnverified || (input.hasDanish && input.danishChanged) ? 'manual' : 'verified'
  if (!input.hasDanish || input.catalogLemma) return 'verified'
  if (input.catalogStatus === 'pending') return 'pending'
  return input.catalogStatus === 'miss' || (input.catalogStatus === 'hit' && input.wroteMeaning) ? 'manual' : 'verified'
}

/**
 * A new entry is manual once the catalog has missed, or when the catalog offered the word and the
 * learner wrote their own meaning instead of picking one. A saved entry is manual when it already
 * was, or when its Danish is being changed: no catalog backs the new text.
 */
export function isManualEntry(input: ManualEntryInput): boolean {
  return manualEntryVerdict(input) === 'manual'
}
