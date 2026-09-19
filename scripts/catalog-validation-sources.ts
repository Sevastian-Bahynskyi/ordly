/**
 * The source adapter `scripts/validate-catalog.ts` injects (issue #6 §9).
 *
 * The gate deliberately owns no knowledge of COR's tag format or of the spelling dictionary —
 * `lib/cor.ts` is the only module allowed to read a tag (§22), and `lib/spelling.ts` owns nspell.
 * This file is the wiring between them and nothing else.
 *
 * Both checks fail closed. `findMisspellings` returns `null`, not `[]`, when the dictionary could
 * not be built, and an empty list means "every word is spelled correctly" — a claim no caller may
 * make on behalf of a check that never ran.
 *
 *   pnpm exec tsx scripts/validate-catalog.ts \
 *     --facts catalog/facts.jsonl \
 *     --input catalog/out/batch-0001.json \
 *     --sources scripts/catalog-validation-sources.ts
 */
import { corLemmaHasPartOfSpeech as lemmaHasPartOfSpeech } from '../lib/catalog-facts'
import type { CatalogValidationSources } from '../lib/catalog-validation'
import { corLookupForm, parseCorForms, type CorForm } from '../lib/cor'
import { findMisspellings as findDanishMisspellings } from '../lib/spelling'
import type { PartOfSpeech } from '../lib/types'
import { literal, queryJson } from './catalog-db'

/** One round trip per distinct lemma, then in memory: a batch is forty words, not forty thousand. */
const formCache = new Map<string, Promise<CorForm[] | null>>()

async function corForms(lemma: string): Promise<CorForm[] | null> {
  const form = corLookupForm(lemma)
  if (!form) return []
  let pending = formCache.get(form)
  if (!pending) {
    pending = queryJson<unknown>(`select form, lemma, tag from cor_form where form = ${literal(form)}`)
      .then((rows) => parseCorForms(rows))
      // A database that could not answer is not a database that said no.
      .catch(() => null)
    formCache.set(form, pending)
  }
  return pending
}

export const catalogValidationSources: CatalogValidationSources = {
  async corLemmaHasPartOfSpeech(lemma: string, pos: PartOfSpeech): Promise<boolean | null> {
    const rows = await corForms(lemma)
    if (rows === null) return null
    return lemmaHasPartOfSpeech(rows, corLookupForm(lemma), pos)
  },

  async findMisspellings(text: string): Promise<string[] | null> {
    const found = await findDanishMisspellings(text)
    return found === null ? null : found.map((misspelling) => misspelling.word)
  },
}

export default catalogValidationSources
