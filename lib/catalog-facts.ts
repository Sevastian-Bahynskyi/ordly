import type { CatalogFact, CatalogIpaSource, CatalogKind } from './catalog-contract'
import { corBaseForm, corGenderForPos, corPartOfSpeech, corPartsOfSpeech, type CorForm } from './cor'
import type { NounGender, PartOfSpeech } from './types'

/**
 * Layer 1 of issue #6 §3: everything about a lemma that a source can answer, so that no model is
 * ever asked to have an opinion about it.
 *
 * The rule the whole catalog rests on is here: **a field a source cannot settle stays null.** A
 * null gender is a fact about the register's certainty, and it travels all the way to the app,
 * where nothing is shown rather than something invented. §22 calls this "silence beats a guess",
 * and it was written after a model confidently invented a Russian translation for `tinker`.
 */
export interface CatalogFactInput {
  lemma: string
  kind: CatalogKind
  freqRank: number | null
  /** The frequency list's word class, if it had one. A hint, never the last word. */
  posHint: PartOfSpeech | null
  /** COR rows whose `form` is the lemma — what the lemma is, and whether it is ambiguous. */
  formRows: readonly CorForm[]
  /** COR rows whose `lemma` is the lemma — every inflected form it has. */
  lemmaRows: readonly CorForm[]
  ipa: string | null
  ipaSource: CatalogIpaSource | null
}

function rowsForLemma(rows: readonly CorForm[], lemma: string): CorForm[] {
  return rows.filter((row) => row.lemma === lemma)
}

/** True when COR lists this lemma as a lemma in that part of speech — the §9 gate's question. */
export function corLemmaHasPartOfSpeech(
  formRows: readonly CorForm[],
  lemma: string,
  pos: PartOfSpeech,
): boolean {
  return rowsForLemma(formRows, lemma).some((row) => corPartsOfSpeech(row.tag).includes(pos))
}

/**
 * The part of speech to build the row in.
 *
 * The frequency list's class is preferred, but only once COR has confirmed the lemma really is
 * that class — a list built from a corpus can label a word by how it was used there. When COR
 * cannot confirm it, the register's own unambiguous reading is used, and when the register is
 * ambiguous the answer is null and the generator is allowed to choose (§8 rule 3). `ved` reaches
 * the generator with no part of speech, which is the honest description of a word that is two.
 */
export function resolvePartOfSpeech(
  formRows: readonly CorForm[],
  lemma: string,
  posHint: PartOfSpeech | null,
): PartOfSpeech | null {
  if (posHint && corLemmaHasPartOfSpeech(formRows, lemma, posHint)) return posHint
  const rows = rowsForLemma(formRows, lemma)
  if (!rows.length) return posHint
  return corPartOfSpeech(rows)
}

/**
 * Whether this lemma may become a catalog headword at all, and what to use instead.
 *
 * A frequency list built from a corpus ranks the most frequent *forms* and calls them lemmas.
 * COR disagrees about roughly one word in sixty: `kan` is an inflection of `kunne`, `mig` of
 * `jeg`, `glemt` of `glemme`, and `bror`, `ide` and `gymnasium` are variant spellings of
 * `broder`, `idé` and `gymnasie`. Teaching the corpus's word would contradict the rule that the
 * dictionary form is the only form a word can be saved in.
 *
 * Returns the lemma to build instead — which is the input when it is already a dictionary form —
 * or `null` when there is nothing honest to build. Null covers the cases `corBaseForm` refuses:
 * a register that has never heard of the word (it may still be real, so the live path keeps it),
 * readings that disagree (`far` is both `fader` and `fare`), and a lemma that is two words
 * (`selv om`, `nogen sinde`, `f.eks.`), which no single-word catalog row can hold.
 */
export function catalogHeadword(
  formRows: readonly CorForm[],
  lemma: string,
  pos: PartOfSpeech | null,
): string | null {
  if (!formRows.length) return lemma
  if (pos && corLemmaHasPartOfSpeech(formRows, lemma, pos)) return lemma
  if (!pos && rowsForLemma(formRows, lemma).length) return lemma
  const base = corBaseForm(formRows, lemma, pos ? [pos] : [])
  if (!base || /\s/u.test(base)) return null
  return base
}

const DEFINITE_SINGULAR_TAGS: Record<NounGender, string> = {
  en: 'sb.fk.sg.best',
  et: 'sb.itk.sg.best',
}

const INDEFINITE_PLURAL_TAGS: Record<NounGender, string> = {
  en: 'sb.fk.pl.ubest',
  et: 'sb.itk.pl.ubest',
}

/**
 * The inflected form COR records under one exact tag, or null.
 *
 * Read from the register rather than built by appending an article, because `menneske` becomes
 * `mennesket` and `skulder` becomes `skulderen` — not the same rule, and §22 forbids inventing
 * either. Two rows under the same tag means the register itself is undecided, so: null.
 */
export function corFormForTag(lemmaRows: readonly CorForm[], lemma: string, tag: string): string | null {
  const forms = new Set(rowsForLemma(lemmaRows, lemma).filter((row) => row.tag === tag).map((row) => row.form))
  return forms.size === 1 ? [...forms][0] : null
}

/**
 * One `facts.jsonl` line.
 *
 * A phrase gets nothing from COR — the register holds no multi-word entries at all (0 of 9 real
 * ones matched, §2 of the issue), so asking it about `godt lide` and reading the silence as "not
 * Danish" would be a bug, not a check. Phrases carry frequency-free, register-free facts and lean
 * entirely on the §9 gate's other rules.
 */
export function buildCatalogFact(input: CatalogFactInput): CatalogFact {
  const lemma = input.lemma.trim().toLocaleLowerCase('da-DK')
  if (!lemma) throw new Error('A catalog fact needs a lemma')

  if (input.kind === 'phrase') {
    return {
      lemma,
      kind: 'phrase',
      freq_rank: input.freqRank,
      pos: input.posHint ?? 'phrase',
      gender: null,
      definite_singular: null,
      indefinite_plural: null,
      ipa: input.ipa,
      ipa_source: input.ipa ? input.ipaSource : null,
    }
  }

  const pos = resolvePartOfSpeech(input.formRows, lemma, input.posHint)
  const gender = corGenderForPos(rowsForLemma(input.formRows, lemma), pos)
  return {
    lemma,
    kind: 'word',
    freq_rank: input.freqRank,
    pos,
    gender,
    definite_singular: gender ? corFormForTag(input.lemmaRows, lemma, DEFINITE_SINGULAR_TAGS[gender]) : null,
    indefinite_plural: gender ? corFormForTag(input.lemmaRows, lemma, INDEFINITE_PLURAL_TAGS[gender]) : null,
    ipa: input.ipa,
    ipa_source: input.ipa ? input.ipaSource : null,
  }
}
