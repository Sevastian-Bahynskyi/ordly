import assert from 'node:assert/strict'
import test from 'node:test'
import {
  corBaseForm,
  corGenderForPos,
  corGenderFromTag,
  corLookupForm,
  corPartOfSpeech,
  corPartsOfSpeech,
  definiteFormKey,
  fillCorGender,
  isKnownDanishForm,
  splitDefiniteForm,
} from './cor.ts'
import { createSense } from './senses.ts'

/** Real rows from cor1.5.1.0.tsv, written as `lemma|tag`. Nothing here is invented. */
const forms = (form, ...pairs) => pairs.map((pair) => {
  const [lemma, tag] = pair.split('|')
  return { form, lemma, tag }
})

const VED = forms('ved', 'ved|præp', 'ved|adv', 'vide|vb.præs.akt', 'ved|sb.itk.sg.ubest')
const TAGE = forms('tage', 'tage|vb.inf.akt', 'tag|sb.itk.pl.ubest')
const PLAN = forms('plan', 'plan|adj.sg.ubest.fk', 'plane|vb.imp', 'plan|sb.fk.sg.ubest', 'plan|sb.itk.sg.ubest', 'plan|sb.itk.pl.ubest')
const ALT = forms('alt', 'alt|adv', 'al|pron.sg.itk', 'alt|sb.fk.sg.ubest', 'alt|sb.itk.sg.ubest')
const HÅNDKLÆDE = forms('håndklæde', 'håndklæde|sb.itk.sg.ubest')
const BIL = forms('bil', 'bile|vb.imp', 'bil|sb.fk.sg.ubest')
const MENNESKER = forms('mennesker', 'menneske|sb.itk.pl.ubest')
const SKULDEREN = forms('skulderen', 'skulder|sb.fk.sg.best')

test('a bare form lookup is not allowed to decide the gender — the sense’s part of speech filters first', () => {
  // `ved` means "knows" or "near". COR also holds the noun `ved`, which is *wood*: a naive
  // lookup writes `et` onto a verb. Filtering by the sense's own part of speech is the whole
  // guard, and without a part of speech there is nothing to filter with, so nothing is written.
  assert.equal(corGenderForPos(VED, 'verb'), null)
  assert.equal(corGenderForPos(VED, 'preposition'), null)
  assert.equal(corGenderForPos(VED, null), null)
  // `tage` is "to take"; the noun it collides with is the plural of `tag`, a roof.
  assert.equal(corGenderForPos(TAGE, 'verb'), null)

  // The filter is not a blanket refusal: a sense that really is a noun still gets its gender.
  assert.equal(corGenderForPos(VED, 'noun'), 'et')
})

test('disagreement inside the filtered candidates is silence, never a coin toss', () => {
  // `plan` and `alt` are genuinely both genders in Danish. No source can settle them, so COR
  // must not answer at all — a wrong `en`/`et` is worse than none.
  assert.equal(corGenderForPos(PLAN, 'noun'), null)
  assert.equal(corGenderForPos(ALT, 'noun'), null)
  // An unknown word has no candidates, which is also silence rather than a guess.
  assert.equal(corGenderForPos([], 'noun'), null)
})

test('an unambiguous noun gets its gender from the tag, inflected forms included', () => {
  assert.equal(corGenderForPos(HÅNDKLÆDE, 'noun'), 'et')
  assert.equal(corGenderForPos(BIL, 'noun'), 'en')
  // Gender belongs to the singular dictionary noun; a plural or definite form keeps it.
  assert.equal(corGenderForPos(MENNESKER, 'noun'), 'et')
  assert.equal(corGenderForPos(SKULDEREN, 'noun'), 'en')
})

test('tags map to parts of speech, and only `sb` carries a gender', () => {
  assert.deepEqual(corPartsOfSpeech('sb.itk.sg.ubest'), ['noun'])
  assert.deepEqual(corPartsOfSpeech('vb.præs.akt'), ['verb'])
  assert.deepEqual(corPartsOfSpeech('adj.sg.ubest.fk'), ['adjective'])
  // `adj.adv` is the adverbial form of an adjective — `hurtigt`. It answers to either label,
  // because the learner may reasonably have classified the sense as one or the other.
  assert.deepEqual(corPartsOfSpeech('adj.adv'), ['adjective', 'adverb'])
  assert.deepEqual(corPartsOfSpeech('flerord'), ['phrase'])
  // Abbreviations, prefixes and suffixes are not parts of speech Ordly has, and answer to none.
  assert.deepEqual(corPartsOfSpeech('fork'), [])
  assert.deepEqual(corPartsOfSpeech('præfiks'), [])

  assert.equal(corGenderFromTag('sb.fk.sg.best'), 'en')
  assert.equal(corGenderFromTag('sb.itk.pl.ubest'), 'et')
  // A noun COR records without a gender, and a verb that merely looks like one.
  assert.equal(corGenderFromTag('sb.pl.ubest'), null)
  assert.equal(corGenderFromTag('vb.imp'), null)
})

test('COR settles the part of speech only when every candidate agrees', () => {
  assert.equal(corPartOfSpeech(HÅNDKLÆDE), 'noun')
  assert.equal(corPartOfSpeech(MENNESKER), 'noun')
  // `bil` collides with the imperative of `bile`, and `ved` with three other classes. Both go
  // to the model, which is exactly the 36% the research predicted.
  assert.equal(corPartOfSpeech(BIL), null)
  assert.equal(corPartOfSpeech(VED), null)
  assert.equal(corPartOfSpeech([]), null)
})

test('the lookup key is one lowercase word, and multi-word entries have none', () => {
  assert.equal(corLookupForm('Håndklæde'), 'håndklæde')
  assert.equal(corLookupForm('  gulvet  '), 'gulvet')
  assert.equal(corLookupForm('Hvordan?'), 'hvordan')
  // COR holds no multi-word expressions at all (0 of 9 in the vocabulary matched), so a phrase
  // or a sentence has nothing to look up and must not be judged against it.
  assert.equal(corLookupForm('tage på stranden'), '')
  assert.equal(corLookupForm('Hvordan går det?'), '')
  assert.equal(corLookupForm(''), '')
  assert.equal(corLookupForm('123'), '')
})

test('a form COR does not know is not Danish as far as the register is concerned', () => {
  // `tinker` is not a Danish word; the enrichment path invented a Russian translation for it.
  assert.equal(isKnownDanishForm([]), false)
  assert.equal(isKnownDanishForm(HÅNDKLÆDE), true)
})

test('filling gender touches nothing else, and never overrules a gender already chosen', () => {
  const senses = [
    createSense('полотенце', { pos: 'noun', gender: null }),
    createSense('плечо', { pos: 'noun', gender: 'en' }),
    createSense('вытирать', { pos: 'verb', gender: null }),
    createSense('старое значение', { pos: 'noun', gender: null, removed_at: '2026-09-01T00:00:00.000Z' }),
  ]

  const filled = fillCorGender(senses, HÅNDKLÆDE)
  assert.equal(filled[0].gender, 'et', 'the noun with no gender is the one that gets filled')
  assert.equal(filled[0].text, senses[0].text)
  assert.equal(filled[0].id, senses[0].id)
  assert.equal(filled[1].gender, 'en', 'a gender the learner or an earlier pass chose stands')
  assert.equal(filled[2].gender, null, 'a verb never carries one')
  assert.equal(filled[3].gender, null, 'a removed sense is left exactly as it was')

  // Ambiguous candidates change nothing at all, and the same array comes back untouched.
  assert.equal(fillCorGender(senses, PLAN), senses)
  assert.equal(fillCorGender(senses, []), senses)
})

const HUS = forms('hus', 'hus|sb.itk.sg.ubest', 'huse|vb.imp')
const GULVET = forms('gulvet', 'gulv|sb.itk.sg.best')
const DOVNE = forms('dovne', 'doven|adj.sg.best', 'doven|adj.pl', 'dovne|vb.inf.akt')
const SYNES = forms('synes', 'syne|vb.inf.pass', 'syne|vb.præs.pass', 'synes|vb.imp', 'synes|vb.inf.akt', 'synes|vb.præs.akt')
const NOGENSINDE = forms('nogensinde', 'nogen sinde|adv')

test('an inflected form is brought to the word the dictionary lists', () => {
  assert.equal(corBaseForm(GULVET, 'gulvet', []), 'gulv')
  assert.equal(corBaseForm(MENNESKER, 'mennesker', ['noun']), 'menneske')
  assert.equal(corBaseForm(SKULDEREN, 'skulderen', ['noun']), 'skulder')
})

test('a form the register lists as a word in that same reading is already a base form', () => {
  assert.equal(corBaseForm(HUS, 'hus', ['noun']), null, '`hus` is a lemma even though `huse` also inflects to it')
  // `synes` is a deponent verb: its own infinitive. The passive of `syne` is a different word.
  assert.equal(corBaseForm(SYNES, 'synes', ['verb']), null)
})

test('the part of speech decides which reading is being inflected', () => {
  // `dovne` is the plural adjective of `doven` and also the infinitive of the verb "to laze".
  // Asked without a word class, the verb reading would shield the adjective card forever.
  assert.equal(corBaseForm(DOVNE, 'dovne', ['adjective']), 'doven')
  assert.equal(corBaseForm(DOVNE, 'dovne', ['verb']), null, 'as a verb it is already the base form')

  // `alt` is the same shape seen from the other side: a lemma as an adverb and as a noun, but
  // the pronoun that means "всё" is an inflection of `al`, and that is the card being judged.
  assert.equal(corBaseForm(ALT, 'alt', ['adverb']), null)
  assert.equal(corBaseForm(ALT, 'alt', ['pronoun']), 'al')
})

test('nothing is proposed when the register cannot settle it', () => {
  // Two readings, two different words: `ved` is "knows" (vide) and the preposition "by".
  assert.equal(corBaseForm(VED, 'ved', ['verb', 'preposition']), null)
  // A word Ordly does not hold is not the base-form check's problem.
  assert.equal(corBaseForm([], 'tinker', []), null)
  // COR lemmatises `nogensinde` to two words, which is a spelling variant, not an inflection.
  assert.equal(corBaseForm(NOGENSINDE, 'nogensinde', ['adverb']), null)
})

test('the definite form is what teaches the gender, and it is split, not assembled', () => {
  assert.deepEqual(splitDefiniteForm('gulvet', 'et'), { stem: 'gulv', article: 'et' })
  assert.deepEqual(splitDefiniteForm('skulderen', 'en'), { stem: 'skulder', article: 'en' })
  // `menneske` loses its own final `e`, which is why the form is read from COR and never built
  // by appending the article to the lemma.
  assert.deepEqual(splitDefiniteForm('mennesket', 'et'), { stem: 'mennesk', article: 'et' })
  assert.equal(splitDefiniteForm('gulvet', 'en'), null, 'a form that does not carry that article is not shown')
  assert.equal(splitDefiniteForm('et', 'et'), null)
})

test('a word that is both genders keeps its two definite forms apart', () => {
  // `en plan` is a plan and becomes `planen`; `et plan` is a level and becomes `planet`.
  assert.notEqual(definiteFormKey('plan', 'en'), definiteFormKey('plan', 'et'))
  assert.equal(definiteFormKey('Plan', 'en'), definiteFormKey('plan', 'en'), 'the key folds case the way the lookup does')
})
