/**
 * The source adapter `scripts/validate-catalog.ts` injects for phrase batches (issue #16).
 *
 * Same fail-closed contract as `catalog-validation-sources.ts`. A phrase example is located by the
 * phrase's own verified forms from the inventory (`står op` for `stå op`, `glæder os til` for
 * `glæde sig til`), contiguously — never by guessing an inflection. COR holds no multi-word
 * entries, so its check is never asked about a phrase; answering "unavailable" keeps it fail-closed
 * if a word row is ever run through this adapter by mistake.
 *
 *   pnpm exec tsx scripts/validate-catalog.ts --facts catalog/phrases/facts.jsonl \
 *     --input catalog/phrases/out/batch-0001.json --sources scripts/phrase-validation-sources.ts \
 *     --needs-review catalog/phrases/needs_review.jsonl
 */
import { readFileSync } from 'node:fs'
import { countPhraseOccurrences, type PhraseCandidate } from '../lib/catalog-phrases'
import type { CatalogValidationSources } from '../lib/catalog-validation'
import { findMisspellings as findDanishMisspellings } from '../lib/spelling'

const formsByPhrase = new Map(readFileSync('catalog/phrases/inventory.jsonl', 'utf8').split('\n').filter(Boolean)
  .map((line) => JSON.parse(line) as PhraseCandidate).map((candidate) => [candidate.phrase, candidate.forms]))

export const catalogValidationSources: CatalogValidationSources = {
  async corLemmaHasPartOfSpeech(): Promise<boolean | null> {
    return null
  },

  async findMisspellings(text: string): Promise<string[] | null> {
    const found = await findDanishMisspellings(text)
    return found === null ? null : found.map((misspelling) => misspelling.word)
  },

  exampleContainsLemma(example: string, lemma: string): boolean | null {
    const forms = formsByPhrase.get(lemma)
    if (!forms) return null
    return countPhraseOccurrences(example, forms) === 1
  },
}

export default catalogValidationSources
