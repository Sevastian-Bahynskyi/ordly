import assert from 'node:assert/strict'
import test from 'node:test'
import { entryProblems, placePhraseStress, pronunciationProblems } from './content-gate.ts'
import { loadUkrainianCheckers } from './ukrainian-dictionaries.ts'

const spell = await loadUkrainianCheckers()
const sense = (patch = {}) => ({
  ordinal: 1, ru: 'останавливаться, глохнуть', en: 'to stall, to come to a standstill', uk: 'зупинятися, глухнути',
  example: 'Forhandlingerne gik i stå i går.', example_en: 'The negotiations stalled yesterday.', example_ru: 'Переговоры вчера зашли в тупик.', example_uk: 'Переговори вчора зайшли в глухий кут.',
  ...patch,
})
const entry = { lemma: 'gå i stå', kind: 'phrase', pos: 'verb', forms: ['gå i stå', 'går i stå', 'gik i stå', 'gået i stå'] }
const check = (senses, unknown = () => []) => entryProblems(entry, senses, { spell, unknownWords: unknown })

test('a clean sense passes the gate', () => {
  assert.deepEqual(check([sense()]), [])
})

test('wordings in the wrong language or script are caught', () => {
  const problems = check([sense({ ru: 'to stall', uk: 'останавливаться', en: 'at gå i stå' })])
  assert.ok(problems.some((problem) => /ru/u.test(problem)))
  assert.ok(problems.some((problem) => /uk wording/u.test(problem)))
  assert.ok(problems.some((problem) => /en/u.test(problem)))
})

test('the example must use one verified form once, spelled correctly, with every translation', () => {
  assert.ok(check([sense({ example: 'Forhandlingerne stoppede i går.' })]).some((problem) => /form/u.test(problem)))
  assert.ok(check([sense({ example: 'Motoren gik i stå, og bilen gik i stå.' })]).some((problem) => /form/u.test(problem)))
  assert.ok(check([sense({ example_uk: '' })]).some((problem) => /example_uk/u.test(problem)))
  assert.ok(check([sense({ example: 'Den gik i stå 3 gange.' })]).some((problem) => /digit/u.test(problem)))
  assert.ok(check([sense()], () => ['forhandlingerne']).some((problem) => /unknown/u.test(problem)))
})

test('two senses of one entry cannot share a wording', () => {
  const problems = check([sense(), sense({ ordinal: 2, en: 'to stall, to come to a standstill' })])
  assert.ok(problems.some((problem) => /same as sense 1/u.test(problem)))
})

test('a phrase pronunciation is Cyrillic only, stressed, and reads every word of the phrase', () => {
  assert.deepEqual(pronunciationProblems('stå op', 'сдо о́б'), [])
  assert.deepEqual(pronunciationProblems('stå op', ''), ['the pronunciation is missing'])
  assert.deepEqual(pronunciationProblems('stå op', 'сдо ób'), ['the pronunciation must be Cyrillic letters only'])
  assert.deepEqual(pronunciationProblems('stå op', "сдо о'б"), ['the stress must be an acute accent (о́), not an apostrophe'])
  assert.deepEqual(pronunciationProblems('stå op', 'сдо об'), ['the phrase stress is not marked'])
  assert.deepEqual(pronunciationProblems('lade være med at', 'ла́ вэ́эа мэ ад'), ['mark one phrase stress, not 2'])
  assert.deepEqual(pronunciationProblems('sige til', 'си́ тэль', 1), ['the stress belongs on "til"'])
  assert.deepEqual(pronunciationProblems('sige til', 'си тэ́ль', 1), [])
  assert.deepEqual(pronunciationProblems('være nødt til', 'вэ нёд тэ', 1), [], 'ё is stressed by itself')
  assert.deepEqual(pronunciationProblems('give sig', 'гиˀ са́й'), [], 'a stød or length mark is dropped, not rejected')
  assert.deepEqual(pronunciationProblems('finde ud af', 'фэн у́ð'.replace('ð', 'д')), ['the pronunciation has 2 words, the phrase 3'])
})

test('the phrase stress is placed by rule on the stressed word, at the syllable its IPA stresses', () => {
  assert.equal(placePhraseStress('сдо́ об', 1, '[ˈsdɔˀ] [ˈʌb]'), 'сдо о́б')
  assert.equal(placePhraseStress('ко́мэ хьем', 1, '[ˈkʌmə] [ˈjεmˀ]'), 'комэ хье́м')
  assert.equal(placePhraseStress('вэ нёд тэ', 1, '[ˈvεːʌ] [ˈnøðˀ] [te]'), 'вэ нё́д тэ')
  assert.equal(placePhraseStress('комэ тилбагэ', 1, '[ˈkʌmə] [teˈbæːjə]'), 'комэ тилба́гэ', 'second syllable, as the IPA marks it')
  assert.equal(placePhraseStress('ла вээ', 1, '[la ˈʋɛːɐ]'), 'ла вэ́э', 'a whole-phrase IPA is split per word')
  assert.equal(placePhraseStress('ла', 0, '[ˈla]'), 'ла́')
  assert.equal(placePhraseStress('тэ имод', 1, '[ˈtæˀ] [iˌmoðˀ]'), 'тэ имо́д', 'a secondary mark stands in for a missing main one')
  assert.equal(placePhraseStress('блиэ фоэльсгэд и', 1, '[ˈbliːə] [fɒˈɛlsɡ̊əð] [i]'), 'блиэ фоэ́льсгэд и', 'two different vowels are two syllables; a doubled one is one long vowel')
})
