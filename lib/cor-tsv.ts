/**
 * Det Centrale Ordregister's shipped TSV (CC0), read the way `public.cor_form` stores it.
 *
 * Shared by the importer and by the offline content pipeline (issue #16), which reads a local
 * copy instead of the database when `CATALOG_COR_TSV` names one.
 */

/** Field positions in the six-column TSV, 0-based. Field 3 (Glosse) is unused. */
const LEMMA = 1
const TAG = 3
const FORM = 4
const NORMERING = 5

export interface CorRow {
  form: string
  lemma: string
  tag: string
}

/**
 * Parse the TSV into the rows the table stores: normering `N` only, form and lemma lowercased
 * because every lookup is case-insensitive, and deduplicated because one form/lemma/tag triple
 * can carry several COR ids.
 */
export function parseCorTsv(tsv: string): CorRow[] {
  const byKey = new Map<string, CorRow>()
  for (const line of tsv.split('\n')) {
    if (!line) continue
    const fields = line.split('\t')
    if (fields.length !== 6 || fields[NORMERING] !== 'N') continue
    // Exactly the key `corLookupForm` builds, or a form imported here would never be found.
    const form = fields[FORM].normalize('NFC').trim().toLocaleLowerCase('da-DK')
    const lemma = fields[LEMMA].normalize('NFC').trim().toLocaleLowerCase('da-DK')
    const tag = fields[TAG].trim()
    if (!form || !lemma || !tag) continue
    byKey.set(`${form}\t${lemma}\t${tag}`, { form, lemma, tag })
  }
  return [...byKey.values()]
}
