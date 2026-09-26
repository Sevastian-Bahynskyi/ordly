/**
 * Multi-word catalog entries (issue #16): particle verbs, fixed expressions and prepositional or
 * adverbial phrases.
 *
 * Phrases enter the catalog only from rights-cleared inventories that name them — never from a
 * model's list. A model may later judge which inventory items are learnable units and what they
 * mean, but it cannot add an item, so every phrase carries the source record that attests it:
 *
 * - Danish FrameNet 1.0 (DSL + University of Copenhagen; WordNet-style licence: use, copy, modify
 *   and distribute for any purpose, with the copyright notice kept) — DDO fixed expressions and
 *   valency patterns built on 5,300 verbs.
 * - Wikidata Lexemes (CC0) — Danish lexemes whose lemma has a space.
 * - DDO full-form list (DSL Open) — the multi-word headwords DDO inflects (`uden for`, `om bord`).
 *
 * Facts derived here are deterministic: every token must be a form DDO knows, a verb-headed
 * phrase's forms are the head verb's DDO-verified forms with the rest held fixed, and the
 * reflexive pronoun is expanded over its closed set. Nothing is inflected by rule.
 */

export type PhraseSourceId = 'dsl-framenet-1.0' | 'wikidata-lexemes' | 'ddo-fullforms'

export interface PhraseSource {
  source: PhraseSourceId
  /** The record in that source: a FrameNet row id, a Wikidata lexeme id, or a DDO entry id. */
  ref: string
  /** The word class that record declares for the whole phrase, when it declares one. */
  category?: DeclaredCategory
}

export const PHRASE_SOURCE_TERMS: Record<PhraseSourceId, string> = {
  'dsl-framenet-1.0': 'Danish FrameNet 1.0, © 2018 University of Copenhagen and the Society for Danish Language and Literature; Danish FrameNet 1.0 License (use, copy, modify, distribute with notice)',
  'wikidata-lexemes': 'Wikidata Lexemes, CC0 1.0',
  'ddo-fullforms': 'DDO full-form list, Society for Danish Language and Literature (DSL), DSL Open terms',
}

export type PhraseShape =
  | 'particle-verb'
  | 'reflexive-verb'
  | 'verb-expression'
  | 'prepositional'
  | 'adverbial'
  | 'other'

/** Unstressed adverbial particles of Danish particle verbs (`stå op`, `finde ud af`). */
const PARTICLES = new Set(['op', 'ned', 'ud', 'ind', 'af', 'på', 'over', 'om', 'til', 'med', 'frem', 'tilbage', 'væk', 'sammen', 'hjem', 'bort', 'igennem', 'rundt', 'efter', 'fra', 'an', 'løs', 'fast', 'forbi', 'hen', 'ihjel', 'fri', 'overens', 'imod', 'mod', 'ved', 'omkring', 'sted', 'under'])
const PREPOSITIONS = new Set(['af', 'på', 'til', 'med', 'om', 'for', 'i', 'fra', 'over', 'under', 'efter', 'ved', 'mod', 'imod', 'hos', 'uden', 'gennem', 'igennem', 'mellem', 'blandt', 'bag', 'foran', 'siden', 'inden', 'omkring', 'ad'])
/** The reflexive pronoun's closed paradigm, in person order. */
export const REFLEXIVE_PRONOUNS = ['mig', 'dig', 'sig', 'os', 'jer'] as const
/**
 * Placeholders a dictionary writes for an open argument (`give nogen ret`, `tage sin tid`). They are
 * not words of the phrase, and their possessive agreement cannot be derived from one head form, so
 * phrases carrying them are out of scope rather than half-inflected.
 */
const PLACEHOLDERS = new Set(['nogen', 'noget', 'nogens', 'nogets', 'ens', 'sin', 'sit', 'sine'])

export const PHRASE_MIN_TOKENS = 2
export const PHRASE_MAX_TOKENS = 4

export type PhraseRejection = 'not-multiword' | 'too-long' | 'bad-characters' | 'placeholder' | 'unknown-token'

/** Lowercase, NFC, single-spaced; or why the text cannot be a catalog phrase. */
export function normalizePhrase(raw: string): { phrase: string; tokens: string[] } | { rejected: PhraseRejection } {
  const phrase = raw.normalize('NFC').trim().toLocaleLowerCase('da-DK').replace(/\s+/g, ' ')
  if (!/^[\p{Script=Latin}\s-]+$/u.test(phrase) || /(^|\s)-|-(\s|$)/u.test(phrase)) return { rejected: 'bad-characters' }
  const tokens = phrase.split(' ')
  if (tokens.length < PHRASE_MIN_TOKENS) return { rejected: 'not-multiword' }
  if (tokens.length > PHRASE_MAX_TOKENS) return { rejected: 'too-long' }
  // A closing `en` is the dictionary's "someone" (`falde på en`), not an article.
  if (tokens.some((token) => PLACEHOLDERS.has(token)) || tokens[tokens.length - 1] === 'en') return { rejected: 'placeholder' }
  return { phrase, tokens }
}

export type DeclaredCategory = 'verb' | 'adverb' | 'preposition' | 'pronoun' | 'conjunction' | 'interjection' | 'adjective'

/**
 * What the phrase is built like. A word class a source declares for the whole phrase (DDO's class,
 * Wikidata's lexical category, FrameNet's core verb) decides first: `hele tiden` begins with a form
 * of the verb `hele` "heal", and reading it as a verb phrase would inflect it into `helede tiden`.
 * Only a phrase no source classifies falls back to the words: a DDO verb lemma first is a verb phrase.
 */
export function phraseShape(tokens: readonly string[], isVerb: (token: string) => boolean, declared: DeclaredCategory | null = null): { shape: PhraseShape; head: string | null } {
  const [first, second, third] = tokens
  if (declared && declared !== 'verb') {
    if (declared === 'preposition') return { shape: 'prepositional', head: null }
    if (declared === 'adverb') return { shape: 'adverbial', head: null }
    return { shape: 'other', head: null }
  }
  if (isVerb(first)) {
    if (second === 'sig') return { shape: 'reflexive-verb', head: first }
    if (tokens.length === 2 && PARTICLES.has(second)) return { shape: 'particle-verb', head: first }
    if (tokens.length === 3 && PARTICLES.has(second) && PREPOSITIONS.has(third)) return { shape: 'particle-verb', head: first }
    return { shape: 'verb-expression', head: first }
  }
  if (PREPOSITIONS.has(first)) return { shape: PREPOSITIONS.has(tokens[tokens.length - 1]) && tokens.length > 2 ? 'prepositional' : 'adverbial', head: null }
  return { shape: 'other', head: null }
}

/** The part of speech a catalog sense of this phrase is filed under: the declared class when a source gives one. */
export function phrasePartOfSpeech(shape: PhraseShape, declared: DeclaredCategory | null = null): DeclaredCategory | 'phrase' {
  if (shape === 'particle-verb' || shape === 'reflexive-verb' || shape === 'verb-expression') return 'verb'
  if (declared) return declared
  if (shape === 'prepositional') return 'preposition'
  if (shape === 'adverbial') return 'adverb'
  return 'phrase'
}

/** DDO's word classes and Wikidata's lexical categories that name a phrase's class outright. */
export const DDO_PHRASE_CATEGORY: Record<string, DeclaredCategory> = { 'adv.': 'adverb', 'præp.': 'preposition', 'pron.': 'pronoun', 'konj.': 'conjunction', 'udråbsord': 'interjection', 'adj.': 'adjective' }
export const WIKIDATA_PHRASE_CATEGORY: Record<string, DeclaredCategory> = { Q24905: 'verb', Q380057: 'adverb', Q4833830: 'preposition', Q34698: 'adjective', Q83034: 'interjection', Q36484: 'conjunction' }

/** The category the most authoritative source declares: DDO, then Wikidata, then FrameNet's core verb. */
export function declaredCategory(sources: readonly (PhraseSource & { category?: DeclaredCategory })[]): DeclaredCategory | null {
  for (const source of ['ddo-fullforms', 'wikidata-lexemes', 'dsl-framenet-1.0'] as const) {
    const found = sources.find((entry) => entry.source === source && entry.category)
    if (found?.category) return found.category
  }
  return null
}

/**
 * The head verb forms a phrase may be inflected with: the DDO-verified forms, minus the ones a
 * phrase is never taught in — present participles (`stående`), -s passives unless the verb is
 * itself an -s verb, and clipped spoken spellings (`ha'`).
 */
export function phraseHeadForms(head: string, verified: readonly string[]): string[] {
  const deponent = head.endsWith('s')
  return [...new Set(verified.map((form) => form.toLocaleLowerCase('da-DK')))]
    .filter((form) => !form.includes("'") && !form.endsWith('ende') && (deponent || !form.endsWith('s')))
    .sort()
}

/**
 * Every verified surface form of a phrase: the head verb's forms with the other words held fixed,
 * and `sig` expanded over the reflexive paradigm. A phrase with no head verb has one form, itself.
 */
export function phraseForms(tokens: readonly string[], head: string | null, headForms: readonly string[]): string[] {
  let variants: string[][] = [[]]
  tokens.forEach((token, index) => {
    const choices = index === 0 && head ? headForms : token === 'sig' ? [...REFLEXIVE_PRONOUNS] : [token]
    variants = variants.flatMap((prefix) => choices.map((choice) => [...prefix, choice]))
  })
  return [...new Set(variants.map((words) => words.join(' ')))].sort()
}

/** Word tokens of a sentence, as the family gate splits them. */
export function phraseTokens(sentence: string): string[] {
  return sentence.toLocaleLowerCase('da-DK').replace(/[.,!?;:«»"“”()]/gu, ' ').split(/\s+/u).filter(Boolean)
}

/** How many times any of `forms` occurs contiguously in the sentence. */
export function countPhraseOccurrences(sentence: string, forms: readonly string[]): number {
  const words = phraseTokens(sentence)
  let count = 0
  for (const form of forms) {
    const target = form.toLocaleLowerCase('da-DK').split(' ')
    for (let at = 0; at + target.length <= words.length; at += 1) {
      if (target.every((word, offset) => words[at + offset] === word)) count += 1
    }
  }
  return count
}

/**
 * A counter over a corpus: the number of sentences in which any form of a phrase occurs
 * contiguously. Indexed by first word so a 60,000-sentence corpus is scanned once per phrase set.
 */
export function attestationCounter(sentences: readonly string[]): (forms: readonly string[]) => number {
  const byFirst = new Map<string, number[]>()
  const tokenized = sentences.map((sentence) => phraseTokens(sentence))
  tokenized.forEach((words, index) => {
    for (const word of new Set(words)) {
      const list = byFirst.get(word) || []
      list.push(index)
      byFirst.set(word, list)
    }
  })
  return (forms) => {
    const hits = new Set<number>()
    for (const form of forms) {
      const target = form.split(' ')
      for (const index of byFirst.get(target[0]) || []) {
        if (hits.has(index)) continue
        const words = tokenized[index]
        for (let at = 0; at + target.length <= words.length; at += 1) {
          if (target.every((word, offset) => words[at + offset] === word)) { hits.add(index); break }
        }
      }
    }
    return hits.size
  }
}

export const PHRASE_TYPES = ['particle-verb', 'prepositional-verb', 'reflexive-verb', 'idiom', 'collocation', 'time-expression', 'adverbial', 'complex-preposition', 'interjection', 'free'] as const
export type PhraseType = typeof PHRASE_TYPES[number]

/** A model's judgement about one inventory phrase. It never adds a phrase; it only labels one. */
export interface PhraseLabel {
  unit: boolean
  type: PhraseType
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1'
  gloss_en: string
}

export interface PhraseCandidate {
  phrase: string
  tokens: string[]
  shape: PhraseShape
  pos: DeclaredCategory | 'phrase'
  head: string | null
  forms: string[]
  sources: PhraseSource[]
  /** Sentences of the attestation corpus holding a form contiguously. */
  attested: number
  /** The worst (highest) DSL frequency rank among the phrase's words; null when one is unranked. */
  component_rank: number | null
}

/** Most attested first, then the phrase whose rarest word is most common, then alphabetical. */
export function comparePhraseCandidates(left: PhraseCandidate, right: PhraseCandidate): number {
  return right.attested - left.attested
    || (left.component_rank ?? Infinity) - (right.component_rank ?? Infinity)
    || left.phrase.localeCompare(right.phrase, 'da')
}

/** Where a split phrase's other words go: `står … op`. One character, spaced, so it reads as a gap. */
export const PHRASE_GAP = '…'

/** The head verb forms a phrase is recorded in, and the finite ones it can be split after. */
const PHRASE_FORM_KEYS = ['infinitive', 'present', 'past', 'past_participle', 'imperative'] as const
const SPLITTING_KEYS = new Set<string>(['present', 'past'])
export type PhraseFormKey = typeof PHRASE_FORM_KEYS[number]
export interface PhraseFormRow { form_key: PhraseFormKey; form_text: string }

/**
 * The recorded forms of a verb phrase (issue #28): the head verb's register paradigm with the other
 * words held fixed and `sig` expanded, plus a split form after every finite head (`står … op`),
 * because a main clause puts its subject or an adverb between them (`I morgen står jeg op`,
 * `Han står ikke op`). The paradigm is COR's, keyed as `corParadigm` keys it; a head with none
 * gives none, and a phrase with no head verb has only its headword.
 */
export function phraseFormRows(tokens: readonly string[], head: string | null, paradigm: readonly { form_key: string; form_text: string }[]): PhraseFormRow[] {
  if (!head || tokens.length < 2) return []
  const rest = tokens.slice(1)
  const tails = rest.includes('sig')
    ? REFLEXIVE_PRONOUNS.map((pronoun) => rest.map((token) => token === 'sig' ? pronoun : token).join(' '))
    : [rest.join(' ')]
  const rows = new Map<string, PhraseFormRow>()
  for (const form of paradigm) {
    const key = PHRASE_FORM_KEYS.find((candidate) => candidate === form.form_key)
    const verb = form.form_text.trim().toLocaleLowerCase('da-DK')
    if (!key || !verb || /\s/u.test(verb)) continue
    for (const tail of tails) {
      rows.set(`${key}|${verb} ${tail}`, { form_key: key, form_text: `${verb} ${tail}` })
      if (SPLITTING_KEYS.has(key)) rows.set(`${key}|${verb} ${PHRASE_GAP} ${tail}`, { form_key: key, form_text: `${verb} ${PHRASE_GAP} ${tail}` })
    }
  }
  const split = (row: PhraseFormRow): number => Number(row.form_text.includes(PHRASE_GAP))
  return [...rows.values()].sort((left, right) => left.form_key.localeCompare(right.form_key) || split(left) - split(right) || left.form_text.localeCompare(right.form_text, 'da'))
}

/**
 * The IPA a phrase's Cyrillic hint is read from: every word's own recorded IPA, in order. A word
 * with none means the phrase has none, so its hint stays empty rather than read off spelling
 * (AGENTS.md §8).
 */
export function phraseComponentIpa(tokens: readonly string[], ipaOf: (word: string) => string | null): string | null {
  const parts = tokens.map((token) => ipaOf(token)?.trim() || null)
  return parts.every((part): part is string => part !== null) ? parts.join(' ') : null
}

/** Particles that are adverbs, never unstressed prepositions: they take a phrase's stress. */
const ADVERB_PARTICLES = new Set(['op', 'ned', 'ud', 'ind', 'frem', 'tilbage', 'væk', 'sammen', 'hjem', 'bort', 'rundt', 'løs', 'fast', 'forbi', 'hen', 'ihjel', 'fri', 'overens', 'sted', 'omkring'])

/** Words that do not carry a phrase's stress when a content word follows them. */
const UNSTRESSED = new Set([...PREPOSITIONS, ...REFLEXIVE_PRONOUNS, 'at', 'og', 'det', 'den', 'de', 'en', 'et', 'som', 'der', 'man'])

/**
 * Which word of a phrase carries its one stress (Danish unit accentuation), from its labelled type:
 * a particle verb stresses its particle (`stå OP`), a prepositional or reflexive verb its verb
 * (`VENte på`, `GLÆde sig til`), anything else its last content word (`have LYST til`, `i MORgen`).
 * The pronunciation hint is checked against it, so the stress is not left to a model's habit of
 * copying each word's own.
 */
export function phraseStressIndex(tokens: readonly string[], type: string): number {
  if (type === 'particle-verb' && tokens.length > 1 && tokens[1] !== 'sig') {
    // `finde UD af`: a closing preposition or reflexive is unstressed; `tage af STED`: a two-word particle stresses its last word.
    const last = tokens.length - 1
    return last >= 2 && !UNSTRESSED.has(tokens[last]) ? last : 1
  }
  if (type === 'reflexive-verb' || tokens[1] === 'sig') {
    // `sætte sig NED`, `sætte sig IND i`: an adverb particle after the reflexive takes the stress.
    const particle = tokens.findIndex((token, at) => at > 1 && ADVERB_PARTICLES.has(token))
    return particle > 0 ? particle : 0
  }
  if (type === 'prepositional-verb') return 0
  for (let at = tokens.length - 1; at >= 0; at -= 1) if (!UNSTRESSED.has(tokens[at])) return at
  return tokens.length - 1
}
