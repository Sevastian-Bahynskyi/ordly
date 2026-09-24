import { createHash } from 'node:crypto'

/**
 * Reusable sentence families (issue #16; spec #12 decisions 10, 14 and 16).
 *
 * A family teaches one catalog sense in one context. It is a Danish frame with the target word
 * and named slots (`{subject} ligger på {target}.`), the options each slot may take, and the
 * **explicit** list of combinations that are allowed — each with its own target form and its own
 * English and Russian translation. Nothing is recombined at runtime: a combination that is not
 * listed does not exist, and a listed one is checked here before it can be published.
 *
 * Why not generate the combinations: Danish agreement is small but real (`en stor bil`, `et stort
 * hus`), and the translations are not compositional at all — Russian case and gender change
 * the whole sentence. So the frame and slots record *what varies*, and every variant is a whole,
 * separately translated, separately validated sentence. The number of distinct usable sentences
 * is therefore the number of variants that pass, never a Cartesian product.
 *
 * Pure and offline. Everything a check needs from a source (verified forms, spelling, the
 * frozen benchmark) is passed in, so a check that could not run is `null`, never "passed".
 */

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2'] as const
export type CefrLevel = typeof CEFR_LEVELS[number]

export const FAMILY_MIN_VARIANTS = 2
export const FAMILY_MAX_VARIANTS = 6
export const SLOT_MAX_OPTIONS = 6

export interface FamilySlotOption {
  da: string
  /** Other slots' option indexes this option may appear with. Absent means any. */
  requires?: Record<string, number[]>
}

export interface FamilyVariant {
  /** Option index per slot name. Every slot in the frame is named. */
  slots: Record<string, number>
  /** The target word's form in this sentence. Must be a verified form of the lemma. */
  target: string
  en: string
  ru: string
  /** Other complete Danish word orders that are also correct (for the order format). */
  orders?: string[]
  /**
   * Other words that fill the gap correctly given the translation shown (`fordi` beside `for`
   * "because"). A gap two words fit is graded against both rather than calling one of them wrong.
   */
  accepted?: string[]
}

export interface FamilyReply {
  lemma: string
  kind: 'word' | 'phrase'
  sense_id: string
  level: CefrLevel
  situation: string
  grammar: string
  frame: string
  slots: Record<string, FamilySlotOption[]>
  variants: FamilyVariant[]
}

/** What the generator was given for one sense. The reply may not change any of it. */
export interface FamilyWorkSense {
  lemma: string
  kind: 'word' | 'phrase'
  sense_id: string
  pos: string | null
  gender: 'en' | 'et' | null
  freq_rank: number | null
  /** The lowest level a family for this word may be written at. */
  min_level: CefrLevel
  ru: string
  en: string | null
  /** Verified forms of the lemma in this part of speech (DDO full-form list, COR). */
  forms: string[]
}

export interface CefrMatrix {
  version: string
  situations: { id: string; levels: CefrLevel[] }[]
  grammar: { id: string; levels: CefrLevel[] }[]
}

export interface FamilyChecks {
  matrix: CefrMatrix
  /**
   * Words in a Danish sentence no source knows, or null when the spelling source could not be
   * consulted. Null fails the family: a check that never ran passes nothing.
   */
  unknownWords: (sentence: string) => string[] | null
  /** Normalized sentences of the frozen benchmark. A family may not reuse one. */
  benchmark: ReadonlySet<string>
}

const PLACEHOLDER = /\{([a-z][a-z0-9_]*)\}/g
const CYRILLIC = /\p{Script=Cyrillic}/u
const LATIN = /\p{Script=Latin}/u
const DANISH_LETTERS = /[æøåÆØÅ]/u
const END = /[.!?]$/u

export function levelIndex(level: string): number {
  return CEFR_LEVELS.indexOf(level as CefrLevel)
}

/** Frequency band → the lowest level a word is taught at. Words past rank 3,000 are B2. */
export function minLevelForRank(rank: number | null): CefrLevel {
  if (rank === null) return 'B1'
  if (rank <= 750) return 'A1'
  if (rank <= 1500) return 'A2'
  if (rank <= 3000) return 'B1'
  return 'B2'
}

/** Lowercase, single-spaced, without surrounding punctuation: how two sentences are compared. */
export function normalizeSentence(value: string): string {
  return value.toLocaleLowerCase('da-DK').replace(/[.,!?;:«»"“”()]/gu, ' ').replace(/\s+/g, ' ').trim()
}

/** The word tokens of a Danish sentence, lowercased, punctuation dropped. */
export function sentenceWords(value: string): string[] {
  return normalizeSentence(value).split(' ').filter(Boolean)
}

/** The Danish sentence a variant stands for: the frame with every placeholder filled. */
export function variantDanish(family: Pick<FamilyReply, 'frame' | 'slots'>, variant: Pick<FamilyVariant, 'slots' | 'target'>): string | null {
  let missing = false
  const filled = family.frame.replace(PLACEHOLDER, (_, name: string) => {
    if (name === 'target') return variant.target
    const option = family.slots[name]?.[variant.slots[name]]
    if (!option) { missing = true; return '' }
    return option.da
  })
  if (missing) return null
  const text = filled.replace(/\s+/g, ' ').replace(/\s+([.,!?;:])/g, '$1').trim()
  return text ? text.charAt(0).toLocaleUpperCase('da-DK') + text.slice(1) : null
}

function stableUuid(namespace: string, key: string): string {
  const digest = createHash('sha1').update(`${namespace}:${key}`).digest('hex')
  const variant = ((parseInt(digest.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)
  return [digest.slice(0, 8), digest.slice(8, 12), `5${digest.slice(13, 16)}`, `${variant}${digest.slice(18, 20)}`, digest.slice(20, 32)].join('-')
}

/**
 * A family's id is its sense, grammar feature and frame: re-importing the same family mints the
 * same id, and a changed frame is a different family (the old one leaves the snapshot).
 */
export function familyId(family: Pick<FamilyReply, 'sense_id' | 'grammar' | 'frame'>): string {
  return stableUuid('ordly.catalog.family', `${family.sense_id}|${family.grammar}|${family.frame}`)
}

/** A variant's id is its family and its Danish sentence; its version is everything it teaches. */
export function variantId(familyUuid: string, danish: string): string {
  return stableUuid('ordly.catalog.variant', `${familyUuid}|${normalizeSentence(danish)}`)
}

export function variantVersion(variant: { danish: string; target: string; en: string; ru: string; orders: readonly string[]; accepted: readonly string[] }): string {
  return createHash('sha256').update(JSON.stringify(['variant-v2', variant.danish, variant.target, variant.en, variant.ru, [...variant.orders].sort(), [...variant.accepted].sort()])).digest('hex').slice(0, 16)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown, max = 300): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max
}

/** A word-bounded, case-insensitive count of `word` in `sentence`. */
function occurrences(sentence: string, word: string): number {
  const target = word.toLocaleLowerCase('da-DK')
  return sentenceWords(sentence).filter((token) => token === target).length
}

function sameWords(a: string, b: string): boolean {
  const left = sentenceWords(a).sort().join(' ')
  const right = sentenceWords(b).sort().join(' ')
  return left === right
}

/**
 * Indefinite article agreement with a noun target: `en` before a neuter noun, or `et` before a
 * common one, is the wrong inflection whatever else is right. Only the article directly before
 * the target, or before one adjective in front of it, is judged — further away it may belong to
 * something else.
 */
function articleMismatch(danish: string, target: string, gender: 'en' | 'et' | null): boolean {
  if (!gender) return false
  const words = sentenceWords(danish)
  const at = words.indexOf(target.toLocaleLowerCase('da-DK'))
  if (at < 0) return false
  const wrong = gender === 'en' ? 'et' : 'en'
  return words[at - 1] === wrong || (words[at - 2] === wrong && at >= 2 && !['og', 'eller'].includes(words[at - 1]))
}

/** Every problem with one family, one line each. Empty means it may be published. */
export function validateFamily(raw: unknown, work: FamilyWorkSense | undefined, checks: FamilyChecks): string[] {
  if (!isRecord(raw)) return ['not an object']
  const family = raw as unknown as FamilyReply
  const errors: string[] = []
  if (!work) return [`sense ${String(family.sense_id)} is not in the work file`]
  const at = `${work.lemma}`
  if (family.lemma !== work.lemma || family.kind !== work.kind) errors.push(`${at}: identity changed`)

  // Level and matrix cell: a family must sit in a cell the published matrix actually has.
  if (levelIndex(family.level) < 0) errors.push(`${at}: bad level ${String(family.level)}`)
  else if (levelIndex(family.level) < levelIndex(work.min_level)) errors.push(`${at}: level ${family.level} is below this word's band (${work.min_level})`)
  const situation = checks.matrix.situations.find((cell) => cell.id === family.situation)
  const grammar = checks.matrix.grammar.find((cell) => cell.id === family.grammar)
  if (!situation) errors.push(`${at}: unknown situation ${String(family.situation)}`)
  if (!grammar) errors.push(`${at}: unknown grammar ${String(family.grammar)}`)

  // Frame: the target exactly once, every slot named and declared, nothing undeclared.
  if (!text(family.frame, 200)) return [...errors, `${at}: missing frame`]
  const names = [...family.frame.matchAll(PLACEHOLDER)].map((match) => match[1])
  if (names.filter((name) => name === 'target').length !== 1) errors.push(`${at}: the frame must contain {target} exactly once`)
  const slotNames = names.filter((name) => name !== 'target')
  if (new Set(slotNames).size !== slotNames.length) errors.push(`${at}: a slot appears twice in the frame`)
  if (/[{}]/.test(family.frame.replace(PLACEHOLDER, ''))) errors.push(`${at}: stray brace in the frame`)
  const slots = isRecord(family.slots) ? family.slots : {}
  for (const name of Object.keys(slots)) if (!slotNames.includes(name)) errors.push(`${at}: slot ${name} is not in the frame`)
  for (const name of slotNames) {
    const options = slots[name]
    if (!Array.isArray(options) || !options.length || options.length > SLOT_MAX_OPTIONS) { errors.push(`${at}: slot ${name} needs 1–${SLOT_MAX_OPTIONS} options`); continue }
    options.forEach((option, index) => {
      if (!isRecord(option) || !text(option.da, 80) || /[{}]/.test(option.da)) errors.push(`${at}: slot ${name}[${index}] is not a Danish phrase`)
      else if (option.requires !== undefined && !isRecord(option.requires)) errors.push(`${at}: slot ${name}[${index}] has bad requires`)
    })
  }
  if (errors.length) return errors

  // Variants: each an explicit, allowed combination, checked as the whole sentence it makes.
  if (!Array.isArray(family.variants) || family.variants.length < FAMILY_MIN_VARIANTS || family.variants.length > FAMILY_MAX_VARIANTS) {
    return [...errors, `${at}: needs ${FAMILY_MIN_VARIANTS}–${FAMILY_MAX_VARIANTS} variants`]
  }
  const forms = new Set(work.forms.map((form) => form.toLocaleLowerCase('da-DK')))
  const seenDanish = new Set<string>()
  const seenEn = new Set<string>()
  const seenRu = new Set<string>()
  family.variants.forEach((variant, index) => {
    const v = `${at} v${index + 1}`
    if (!isRecord(variant) || !isRecord(variant.slots)) { errors.push(`${v}: not an object`); return }
    const chosen = variant.slots as Record<string, number>
    for (const name of slotNames) {
      const pick = chosen[name]
      if (!Number.isInteger(pick) || !slots[name]?.[pick]) { errors.push(`${v}: slot ${name} has no option ${String(pick)}`); return }
    }
    if (Object.keys(chosen).some((name) => !slotNames.includes(name))) errors.push(`${v}: names a slot the frame does not have`)
    // Constraints: an option that requires particular partners may only appear with them.
    for (const name of slotNames) {
      const requires = slots[name][chosen[name]].requires || {}
      for (const [other, allowed] of Object.entries(requires)) {
        if (!Array.isArray(allowed) || !allowed.includes(chosen[other])) errors.push(`${v}: ${name}[${chosen[name]}] may not appear with ${other}[${String(chosen[other])}]`)
      }
    }
    if (!text(variant.target, 60)) { errors.push(`${v}: missing target form`); return }
    // Inflection: the form in the sentence must be a verified form of this word. A form no
    // source lists is never taught, however plausible it looks.
    if (!forms.has(variant.target.toLocaleLowerCase('da-DK'))) errors.push(`${v}: "${variant.target}" is not a verified form of ${work.lemma}`)
    const danish = variantDanish(family, variant)
    if (!danish) { errors.push(`${v}: the frame could not be filled`); return }
    if (!END.test(danish)) errors.push(`${v}: the sentence must end with . ! or ?`)
    if (occurrences(danish, variant.target) !== 1) errors.push(`${v}: the target must occur exactly once in "${danish}"`)
    if (work.pos === 'noun' && articleMismatch(danish, variant.target, work.gender)) errors.push(`${v}: article does not agree with ${work.lemma} (${work.gender})`)
    const unknown = checks.unknownWords(danish)
    if (unknown === null) errors.push(`${v}: the spelling source could not be consulted`)
    else if (unknown.length) errors.push(`${v}: unknown word(s) ${unknown.join(', ')}`)
    const key = normalizeSentence(danish)
    if (seenDanish.has(key)) errors.push(`${v}: duplicate sentence`)
    seenDanish.add(key)
    if (checks.benchmark.has(key)) errors.push(`${v}: copies a sentence from the frozen benchmark`)

    // Translations: both learner languages, each in its own script, each distinct.
    if (!text(variant.en) || CYRILLIC.test(variant.en) || !LATIN.test(variant.en) || DANISH_LETTERS.test(variant.en) || !END.test(variant.en.trim())) errors.push(`${v}: English translation missing or not English`)
    if (!text(variant.ru) || !CYRILLIC.test(variant.ru) || !END.test(variant.ru.trim())) errors.push(`${v}: Russian translation missing or not Russian`)
    const en = normalizeSentence(variant.en || '')
    const ru = normalizeSentence(variant.ru || '')
    if (seenEn.has(en)) errors.push(`${v}: English translation repeats another variant's`)
    if (seenRu.has(ru)) errors.push(`${v}: Russian translation repeats another variant's`)
    seenEn.add(en)
    seenRu.add(ru)

    // Accepted gap answers: other single words or short phrases, spelled, never the target itself.
    const accepted = variant.accepted ?? []
    if (!Array.isArray(accepted) || accepted.length > 4) errors.push(`${v}: accepted must be a list of at most 4`)
    else for (const alternative of accepted) {
      if (!text(alternative, 40) || /[{}.!?]/.test(alternative)) errors.push(`${v}: bad accepted answer`)
      else if (alternative.trim().toLocaleLowerCase('da-DK') === variant.target.toLocaleLowerCase('da-DK')) errors.push(`${v}: accepted repeats the target`)
      else {
        const unknownAlternative = checks.unknownWords(alternative)
        if (unknownAlternative === null || unknownAlternative.length) errors.push(`${v}: accepted answer "${alternative}" is not known Danish`)
      }
    }

    // Word orders: a real alternative uses exactly the same words, in a different order.
    const orders = variant.orders ?? []
    if (!Array.isArray(orders)) errors.push(`${v}: orders must be a list`)
    else for (const order of orders) {
      if (!text(order, 200) || !END.test(order)) errors.push(`${v}: bad alternative order`)
      else if (normalizeSentence(order) === key) errors.push(`${v}: alternative order repeats the sentence`)
      else if (!sameWords(order, danish)) errors.push(`${v}: alternative order "${order}" does not use the same words`)
    }
  })
  return errors
}

/** A validated family as it is stored: ids derived, sentences filled, versions computed. */
export interface PublishedFamily {
  id: string
  lemma: string
  kind: 'word' | 'phrase'
  sense_id: string
  level: CefrLevel
  situation: string
  grammar: string
  frame: string
  slots: Record<string, FamilySlotOption[]>
  variants: PublishedVariant[]
}

export interface PublishedVariant {
  id: string
  version: string
  danish: string
  target: string
  en: string
  ru: string
  orders: string[]
  accepted: string[]
}

/** Only for a family `validateFamily` accepted. */
export function publishFamily(family: FamilyReply): PublishedFamily {
  const id = familyId(family)
  return {
    id, lemma: family.lemma, kind: family.kind, sense_id: family.sense_id, level: family.level,
    situation: family.situation, grammar: family.grammar, frame: family.frame, slots: family.slots,
    variants: family.variants.map((variant) => {
      const danish = variantDanish(family, variant) as string
      const base = { danish, target: variant.target, en: variant.en.trim(), ru: variant.ru.trim(), orders: variant.orders ?? [], accepted: (variant.accepted ?? []).map((word) => word.trim()) }
      return { id: variantId(id, danish), version: variantVersion(base), ...base }
    }),
  }
}
