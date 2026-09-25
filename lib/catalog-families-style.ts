/**
 * Two narrow, additive checks for the sentence-family generator (issue #16), found by an
 * independent Sonnet audit of the first B2 vertical batch (2026-09-25) and not caught by
 * validateFamily in lib/catalog-families.ts, which checks structure, forms and spelling but not
 * syntax or cross-form agreement. Deliberately NOT a Danish parser: each check inspects only the
 * frame TEMPLATE string or the family's own declared fields, never free Danish text. Both are
 * pure, additive, and run alongside the existing gate — neither weakens it.
 */

// Danish subordinating conjunctions that can front a clause before a comma. Closed, fixed list —
// not an attempt to recognise every Danish conjunction, only the ones that matter for this check.
const SUBORDINATORS = new Set([
  'selvom', 'skønt', 'hvis', 'da', 'fordi', 'når', 'mens', 'inden', 'før', 'siden',
  'medmindre', 'uanset', 'som', 'at', 'idet', 'såfremt',
])

function firstWord(text: string): string {
  return (text.trim().split(/\s+/u)[0] || '').toLocaleLowerCase('da-DK').replace(/[.,!?;:]+$/u, '')
}

/**
 * If a frame's first placeholder is a slot whose every option opens a subordinate clause (begins
 * with a word from SUBORDINATORS), Danish requires a comma directly after that clause and before
 * the main clause. Checked on the frame TEMPLATE: if the fronting slot is first, the literal text
 * immediately after its closing "}" must start with ", " (comma, space) — never just a space. This
 * caught the observed defect: a fronted subordinate clause slot followed straight by
 * "{subject} {verb}" with no comma, which read as ungrammatical Danish (missing V2 inversion cue).
 */
export function frontedSubordinateNeedsComma(frame: string, slots: Record<string, { da: string }[]>): string[] {
  const match = frame.match(/^\{([a-z][a-z0-9_]*)\}/u)
  if (!match) return []
  const slotName = match[1]
  if (slotName === 'target') return []
  const options = slots[slotName]
  if (!options || !options.length) return []
  const allSubordinate = options.every((option) => SUBORDINATORS.has(firstWord(option.da)))
  if (!allSubordinate) return []
  const rest = frame.slice(match[0].length)
  if (!rest.startsWith(', ')) {
    return [`frame fronts a subordinate clause ("${slotName}") but does not open the main clause with ", " — Danish needs a comma and verb-subject inversion after a fronted subordinate clause (e.g. "Selvom X skete, gjorde Y det." not "Selvom X skete Y gjorde det.")`]
  }
  return []
}

/**
 * With "slots": {} (no varying slot at all), the target's own form is the ONLY thing that can
 * differ between variants — so at least two variants must use genuinely different target forms,
 * or the family is structurally guaranteed to produce duplicate (or near-duplicate) sentences.
 * Observed twice: "del" and "klar" both shipped "slots": {} with the identical target form in
 * every variant, differing only in an "orders" entry — not two sentences, one sentence twice.
 *
 * For an adjective target specifically, varying its OWN inflection with no varying slot is worse
 * than a duplicate: nothing in the family says what the fixed subject's gender/number/degree
 * reference is, so a differently-inflected target cannot be verified to agree with it either
 * (validateFamily's agreement check only runs for noun targets). So for pos "adjective", "slots":
 * {} is refused outright, whichever way the target forms are chosen — an adjective family always
 * needs a real varying slot.
 */
export function emptySlotsNeedVaryingTarget(pos: string | null, slots: Record<string, unknown[]>, variants: { target: string }[]): string[] {
  if (Object.keys(slots).length > 0) return []
  if (pos === 'adjective') {
    return ['adjective target with "slots": {} — an adjective family always needs a real varying slot (subject/time/place); its own inflection cannot safely vary with nothing to agree with, and cannot safely repeat with nothing else to vary either']
  }
  const forms = new Set(variants.map((variant) => variant.target.toLocaleLowerCase('da-DK')))
  if (forms.size < 2) {
    return ['"slots": {} with the same target form in every variant — nothing in the family can then make the variants different sentences; use at least two genuinely different target forms (tense/number) or add a real varying slot']
  }
  return []
}

/**
 * A slot option's "requires" may only name other slots — "target" is never a slot (it does not
 * appear in a variant's chosen-option map), so a "requires" naming it is always structurally
 * invalid and validateFamily rejects the whole variant on it. Observed once: a slot option
 * declared requires: {"target": ["ringede"]}, which is either a mistake (should have been left
 * off, since every variant used that target form anyway) or a misunderstanding of what "target"
 * means. Caught here, before Translator budget is spent on a family that cannot pass the gate.
 */
export function invalidRequiresTarget(slots: Record<string, { requires?: Record<string, unknown> }[]>): string[] {
  for (const [name, options] of Object.entries(slots)) {
    for (const option of options) {
      if (option.requires && 'target' in option.requires) {
        return [`slot "${name}" has a "requires" naming "target", which is not a slot and is always invalid — remove it`]
      }
    }
  }
  return []
}

/**
 * A Danish target form ending in "-s" is a different word than its non-"s" counterpart, never an
 * interchangeable spelling of the same one: for a verb it is the -s passive/mediopassive
 * (meddeltes, siges, ses, findes), for a noun a genitive or an unrelated homograph (observed:
 * "del" mixed the plural "dele" with "deles", a verb form of a different word entirely, as if it
 * were a second plural). Both times the family read as fine structurally (two distinct target
 * strings) but the sentences ended up meaning — and translating to — the same thing anyway.
 * Checked mechanically: within one family every target form must agree on ending with an
 * (inflectional) "s" or not — never mixed. This can occasionally over-flag a word that legitimately
 * ends in "s" for an unrelated reason; that only costs a regeneration, never a wrong publish.
 */
export function mixedSFormConstruction(variants: { target: string }[]): string[] {
  if (variants.length < 2) return []
  const endsInS = variants.map((variant) => variant.target.toLocaleLowerCase('da-DK').endsWith('s'))
  if (endsInS.some(Boolean) && endsInS.some((value) => !value)) {
    return [`target forms mix an -s form (passive, genitive, or an unrelated word) with a non-s form (${variants.map((variant) => variant.target).join(', ')}) — pick one construction and stay in it for every variant`]
  }
  return []
}

/**
 * The frame placeholder syntax ({target}, {slotname}) only recognises plain ASCII a-z, digits and
 * underscore in the name — the same pattern lib/catalog-families.ts's PLACEHOLDER regex uses.
 * A slot named with æ/ø/å (observed: {formål}) is silently never recognised as a placeholder at
 * all: it stays as literal, unfilled text in the "Danish" sentence, which is then sent to
 * Translator as-is (producing a translation that preserves the stray braces) and fails the gate's
 * "stray brace" check regardless. Checked directly against the same character class the real
 * placeholder regex uses, so this can never disagree with what the gate itself will find.
 */
export function nonAsciiSlotName(frame: string): string[] {
  const found: string[] = []
  for (const match of frame.matchAll(/\{([^}]*)\}/gu)) {
    const name = match[1]
    if (!/^[a-z][a-z0-9_]*$/.test(name)) found.push(name)
  }
  return found.length ? [`placeholder name(s) not plain ASCII a-z/0-9/_ : ${found.map((name) => `{${name}}`).join(', ')} — these are never recognised as slots and stay as literal broken text`] : []
}

/**
 * A Danish sentence adverb (the "sentence-adverbs" grammar cell) goes after the finite verb in a
 * non-fronted clause, never between the subject and the verb (rule 17). Observed twice, both times
 * with the model naming its finite-verb slot "verb": {target} placed before {verb} in the frame
 * ("{subject} {target} {verb} {object}."). Checked only when a slot is actually named "verb" and
 * {target} is not the frame's first placeholder (a fronted target is checked by
 * frontedSubordinateNeedsComma's V2 logic instead) — narrow on purpose, matching the model's own
 * observed naming rather than guessing which slot is the subject in general.
 */
export function sentenceAdverbBeforeVerb(grammar: string, frame: string): string[] {
  if (grammar !== 'sentence-adverbs') return []
  const targetAt = frame.indexOf('{target}')
  const verbAt = frame.indexOf('{verb}')
  if (targetAt <= 0 || verbAt < 0) return []
  if (targetAt < verbAt) {
    return [`{target} appears before {verb} in the frame — a Danish sentence adverb goes AFTER the finite verb ("{subject} {verb} {target} ...", not "{subject} {target} {verb} ...")`]
  }
  return []
}

/**
 * validateFamily requires 2-6 variants, but that check only ever runs after Translator budget has
 * already been spent on however many the model wrote. Checked here first, before translation, on
 * whatever the model returned — cheaper, and catches the same defect the gate would (observed:
 * "menneske" shipped a single variant with a real slot present, so emptySlotsNeedVaryingTarget
 * never fired).
 */
export function needsMinimumVariants(variants: readonly unknown[], minimum = 2): string[] {
  return variants.length < minimum ? [`only ${variants.length} variant(s) — needs at least ${minimum}, genuinely different sentences`] : []
}

/**
 * The target must occur exactly once in its own sentence (validateFamily's own rule) — checked
 * here first, on the actual filled sentence, so a family that reuses its target word elsewhere in
 * the same sentence (observed: "kommune" reused as ordinary vocabulary — "...skal vores kommune
 * fusionere med en anden kommune") is caught before Translator spend, not after.
 */
export function targetMustOccurOnce(danish: string, target: string): string[] {
  const words = danish.toLocaleLowerCase('da-DK').split(/[^a-zæøå]+/u).filter(Boolean)
  const wanted = target.toLocaleLowerCase('da-DK').split(/[^a-zæøå]+/u).filter(Boolean)
  let count = 0
  for (let at = 0; wanted.length && at + wanted.length <= words.length; at += 1) {
    if (wanted.every((word, offset) => words[at + offset] === word)) count += 1
  }
  return count > 1 ? [`target "${target}" occurs ${count} times in "${danish}" — it must occur exactly once; do not reuse the target word elsewhere in the same sentence`] : []
}

/**
 * {target} already stands for the lemma — hardcoding the lemma's own text again elsewhere in the
 * frame duplicates the word for no reason. Observed: a "derfor" family wrote the frame as
 * "{reason}, derfor {target} {action}." — the literal word "derfor" once as fixed frame text and
 * again via {target}, so every filled sentence said "derfor" twice.
 */
export function lemmaNotDuplicatedInFrame(lemma: string, frame: string): string[] {
  const literalText = frame.replace(/\{[a-z][a-z0-9_]*\}/gu, ' ')
  const words = literalText.toLocaleLowerCase('da-DK').split(/[^a-zæøå]+/u).filter(Boolean)
  return words.includes(lemma.toLocaleLowerCase('da-DK'))
    ? [`the frame's fixed text already contains "${lemma}" as a literal word, in addition to {target} — {target} already represents this word; remove the duplicate`]
    : []
}

/**
 * Every slot the reply declares must appear in its frame — the gate rejects an unused slot
 * ("slot parti is not in the frame"), so it is caught before any translation is paid for.
 */
export function slotsDeclaredInFrame(frame: string, slots: Record<string, unknown>): string[] {
  const named = new Set([...frame.matchAll(/\{([a-z][a-z0-9_]*)\}/gu)].map((match) => match[1]))
  const unused = Object.keys(slots || {}).filter((name) => !named.has(name))
  return unused.length ? [`slot(s) ${unused.join(', ')} are declared but never used in the frame — every slot must appear as {name} in "frame", or be removed`] : []
}

/**
 * An alternative word order is a complete sentence with exactly the variant's words, rearranged —
 * never a template with {target} left in it, never a sentence with other words.
 */
export function ordersUseSameWords(danish: string, orders: readonly unknown[] | undefined): string[] {
  const key = (value: string): string => value.toLocaleLowerCase('da-DK').replace(/[.,!?;:«»"“”()]/gu, ' ').split(/\s+/u).filter(Boolean).sort().join(' ')
  const errors: string[] = []
  for (const order of orders || []) {
    if (typeof order !== 'string' || /[{}]/u.test(order)) errors.push(`"orders" must hold complete Danish sentences, never a template with {placeholders}: ${JSON.stringify(order)}`)
    else if (key(order) !== key(danish)) errors.push(`the alternative order "${order}" does not use exactly the words of "${danish}" — omit it or fix it`)
  }
  return errors
}

const MODALS = new Set(['skal', 'skulle', 'vil', 'ville', 'kan', 'kunne', 'må', 'måtte', 'bør', 'burde', 'tør', 'turde'])

/**
 * A verb standing directly after the infinitive marker `at` or a modal is an infinitive: `skal
 * vænne sig`, `at give efter` — never `skal vænnede mig`, `at givet efter`. `at` as the conjunction
 * "that" is followed by a subject, not a verb, so the rule holds for both readings. `infinitive` is
 * the verb's dictionary form (for a phrase, its head verb); a target not headed by it is not judged.
 */
export function infinitiveAfterAtOrModal(danish: string, target: string, infinitive: string): string[] {
  const words = danish.toLocaleLowerCase('da-DK').split(/[^a-zæøå]+/u).filter(Boolean)
  const wanted = target.toLocaleLowerCase('da-DK').split(/[^a-zæøå]+/u).filter(Boolean)
  const errors: string[] = []
  for (let at = 1; wanted.length && at + wanted.length <= words.length; at += 1) {
    if (!wanted.every((word, offset) => words[at + offset] === word)) continue
    const before = words[at - 1]
    if ((before === 'at' || MODALS.has(before)) && wanted[0] !== infinitive.toLocaleLowerCase('da-DK')) {
      errors.push(`"${before} ${target}" is ungrammatical — after "${before}" the verb must be the infinitive "${infinitive}"`)
    }
  }
  return errors
}

/** Prepositions that are never also conjunctions (so not `for`, `om`, `efter`, `siden`). */
const PURE_PREPOSITIONS = new Set(['til', 'på', 'af', 'med', 'fra', 'hos', 'mod', 'imod', 'ved', 'uden', 'gennem', 'igennem', 'mellem', 'over', 'under', 'blandt'])
// Not `de`: it is also the plural article (`mod de nye regler`).
const SUBJECT_PRONOUNS = new Set(['jeg', 'du', 'han', 'hun', 'vi'])

/**
 * A preposition governs the object form: `til os`, never `til vi`. A subject pronoun straight after
 * a preposition is the mark of a clause broken to keep a particle verb together (`Da solen skinnede,
 * lagde mærke til vi regnbuen`).
 */
export function subjectPronounAfterPreposition(danish: string): string[] {
  const words = danish.toLocaleLowerCase('da-DK').split(/[^a-zæøå]+/u).filter(Boolean)
  const errors: string[] = []
  for (let at = 1; at < words.length; at += 1) {
    if (SUBJECT_PRONOUNS.has(words[at]) && PURE_PREPOSITIONS.has(words[at - 1])) errors.push(`"${words[at - 1]} ${words[at]}" is ungrammatical — a preposition takes the object form, and a subject never follows it; if the verb phrase was kept together after a fronted element, V2 is broken: start the clause with its subject`)
  }
  return errors
}

const FRONTED_OPENERS = new Set(['i', 'på', 'til', 'med', 'efter', 'under', 'om', 'fra', 'ved', 'over', 'uden', 'inden', 'siden', 'før', 'hos', 'nu', 'så', 'derfor', 'endelig', 'pludselig', 'bagefter', 'senere', 'igen', 'tit', 'ofte', 'altid', 'aldrig', 'heldigvis', 'desværre', 'måske', 'her', 'der', 'dengang', 'snart'])
const NON_FINITE_BEFORE = new Set(['at', 'har', 'havde', 'er', 'var', 'blev', 'bliver', 'være', 'været', 'have', 'haft', ...MODALS])
const CLAUSE_OPENERS = new Set(['at', 'som', 'der', 'når', 'hvis', 'fordi', 'da', 'mens', 'selvom', 'om', 'hvor', 'hvad', 'hvem', 'og', 'men', 'eller'])

/**
 * A main clause opened by an adverbial puts the finite verb second and the subject third, so a
 * finite particle or phrasal verb cannot stand unbroken there: `I sin artikel kom ind på
 * journalisten emnet` is wrong, `I sin artikel kom journalisten ind på emnet` is right. Flags a
 * finite multi-word verb target standing in the clause that a preposition or fronted adverb opens,
 * with no subordinating word between them. `infinitive` is the phrase's head verb.
 */
export function finitePhraseAfterFrontedAdverbial(danish: string, target: string, infinitive: string): string[] {
  const wanted = target.toLocaleLowerCase('da-DK').split(/[^a-zæøå]+/u).filter(Boolean)
  if (wanted.length < 2 || wanted[0] === infinitive.toLocaleLowerCase('da-DK')) return []
  const clauses = danish.toLocaleLowerCase('da-DK').split(/[,;:]/u).map((clause) => clause.split(/[^a-zæøå]+/u).filter(Boolean))
  for (const words of clauses) {
    for (let at = 1; at + wanted.length <= words.length; at += 1) {
      if (!wanted.every((word, offset) => words[at + offset] === word)) continue
      // An auxiliary, modal or `at` earlier in the clause makes the target non-finite (`I går har hun givet op`).
      if (words.slice(0, at).some((word) => NON_FINITE_BEFORE.has(word))) continue
      if (!FRONTED_OPENERS.has(words[0]) || words.slice(1, at).some((word) => CLAUSE_OPENERS.has(word))) continue
      return [`"${target}" stands unbroken after the fronted "${words.slice(0, at).join(' ')}" — V2 puts the subject between the verb and its particle there; start the clause with its subject instead`]
    }
  }
  return []
}

const CLAUSE_START_SUBJECTS = new Set(['jeg', 'du', 'han', 'hun', 'vi', 'de', 'man'])
const MIDFIELD_ADVERBS = new Set(['ikke', 'aldrig', 'altid', 'også', 'ofte', 'tit', 'sjældent', 'gerne', 'kun', 'bare', 'nok', 'måske', 'jo', 'vel', 'dog', 'allerede', 'stadig', 'næsten', 'snart', 'endnu', 'heller'])

/**
 * A main clause opened by its pronoun subject is V2: the finite verb comes next, then the sentence
 * adverb (`Jeg spiller aldrig tennis`). `Jeg aldrig spiller` is the subordinate-clause order put in
 * a main clause. Judged on the filled sentence, whatever cell the family is in.
 */
export function adverbBeforeVerbInMainClause(danish: string): string[] {
  const words = danish.toLocaleLowerCase('da-DK').split(/[^a-zæøå]+/u).filter(Boolean)
  return CLAUSE_START_SUBJECTS.has(words[0]) && MIDFIELD_ADVERBS.has(words[1])
    ? [`"${words[0]} ${words[1]} …" breaks V2 — in a main clause the finite verb follows the subject directly and "${words[1]}" comes after it ("${words[0]} <verb> ${words[1]}")`]
    : []
}
