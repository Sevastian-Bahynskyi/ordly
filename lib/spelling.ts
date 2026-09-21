import nspell from 'nspell'
import { danishWords, type Misspelling } from './danish-text'

/**
 * Danish spelling, checked locally (issue #5 §3).
 *
 * `nspell` (MIT) over `dictionary-da` (tri-licensed; Ordly takes the **MPL-1.1** arm, which is
 * file-level copyleft and imposes nothing on this code). No key, no service, no network — the
 * LanguageTool call this sits next to is the same Hunspell dictionary over the wire, capped at 20
 * requests a minute, and it returned nothing at all on a plainly broken Danish sentence.
 *
 * It is a **fast path, never a gate**. It catches orthography; correct-but-unnatural Danish and
 * the wrong inflection of a real word are the common cases, and only the model can judge those.
 * Measured on the real vocabulary: 0% false positives, 14 of 16 learner typos caught, the right
 * suggestion first for 11 of 14. The two misses — `skulderne`, `stadigt` — are real words in the
 * wrong form, which is exactly the dividing line.
 */

export type { Misspelling }

/** At most this many flagged words per check. A sentence with more is not a typo problem. */
const MAX_MISSPELLINGS = 6
const MAX_SUGGESTIONS = 3

/**
 * Strip Hunspell morphological fields, keeping the word and its affix flags.
 *
 * Loaded as shipped, the dictionary flags **12.2%** of the real vocabulary — `blive`, `hvem`,
 * `hver`, `nogle` — because their lines carry fields nspell does not strip
 * (`blive ph:blir al:bliver …`). Entries without those fields are accepted 100% of the time;
 * entries with them, 31% of the time. Cutting each line at the first whitespace fixes it, and
 * `-årig/24,10,49,39` keeps its flags because they are attached with `/`, not a space.
 */
export function cleanDictionary(dic: string): string {
  return dic.split('\n').map((line) => line.split(/[ \t]/)[0]).join('\n')
}

/**
 * The checker, built at most once per server instance.
 *
 * Construction costs ~571 ms and ~126 MB, so it is deliberately lazy: a request that never spells
 * anything never pays for it, and every later request on the same instance reuses it. Lookups are
 * ~0.2 µs and a suggestion ~1.3 ms.
 */
let checker: Promise<ReturnType<typeof nspell>> | null = null

async function buildChecker(): Promise<ReturnType<typeof nspell>> {
  const { default: dictionary } = await import('dictionary-da')
  return nspell(Buffer.from(dictionary.aff), Buffer.from(cleanDictionary(Buffer.from(dictionary.dic).toString('utf8'))))
}

function danishChecker(): Promise<ReturnType<typeof nspell>> {
  checker ??= buildChecker().catch((error: unknown) => {
    // A failed build is not remembered: one unlucky read would otherwise disable spelling for
    // the whole instance, and the next request can simply try again.
    checker = null
    throw error
  })
  return checker
}

/**
 * The words in `text` that Danish orthography does not know, with corrections — or `null` when
 * the dictionary could not be consulted at all.
 *
 * A word is only reported when neither it nor its lowercase form is in the dictionary, so a
 * sentence-initial capital is not a mistake. Never throws: this is a hint beside a model that
 * knows more, and a failure here must not cost the learner their check. The `null` matters: an
 * empty list means "every word is spelled correctly", and a caller must not say that on behalf of
 * a check that never ran.
 */
export async function findMisspellings(text: string): Promise<Misspelling[] | null> {
  try {
    const spell = await danishChecker()
    const seen = new Set<string>()
    const found: Misspelling[] = []
    for (const word of danishWords(text)) {
      const lower = word.toLocaleLowerCase('da-DK')
      if (seen.has(lower)) continue
      seen.add(lower)
      if (spell.correct(word) || spell.correct(lower)) continue
      found.push({ word, suggestions: spell.suggest(word).slice(0, MAX_SUGGESTIONS) })
      if (found.length >= MAX_MISSPELLINGS) break
    }
    return found
  } catch (error) {
    console.warn('Danish spell check unavailable', error instanceof Error ? error.message : 'unknown error')
    return null
  }
}
