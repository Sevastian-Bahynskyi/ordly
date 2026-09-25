import assert from 'node:assert/strict'
import test from 'node:test'
import { ukrainianProblems, ukrainianWordingProblems } from './ukrainian.ts'
import { loadUkrainianCheckers } from './ukrainian-dictionaries.ts'

const checkers = await loadUkrainianCheckers()
const problems = (text) => ukrainianProblems(text, checkers)

test('Ukrainian wordings and sentences pass', () => {
  for (const text of ['підлога', 'думати, вважати', 'кава', 'театр', 'Книга в сумці.', 'Ключі в шухляді.', 'Він живе в Копенгагені.', 'Як справи?', 'йти (пішки)', 'ще раз', 'зараз', 'мить'])
    assert.deepEqual(problems(text), [], text)
})

test('a Russian wording filed as Ukrainian is rejected', () => {
  for (const text of ['думать, считать', 'пол', 'кошка', 'Книга в сумке.', 'Что это?', 'из-за', 'сейчас', 'ещё раз', 'тяжело', 'кофе', 'идти'])
    assert.notDeepEqual(problems(text), [], text)
})

test('letters Ukrainian does not have are named', () => {
  assert.deepEqual(problems('мы'), ['Russian letters: ы', 'Russian words: мы'])
  assert.ok(problems('Это всё.').includes('Russian letters: э, ё'))
  assert.ok(problems('объект').includes('Russian letters: ъ'))
})

test('the words that give Russian away are named', () => {
  assert.deepEqual(problems('Кошка в саду.'), ['Russian words: Кошка'])
  assert.deepEqual(problems('сейчас'), ['Russian words: сейчас'])
})

test('Latin script and empty text are not Ukrainian', () => {
  assert.deepEqual(problems('floor'), ['not Cyrillic'])
  assert.deepEqual(problems('  '), ['empty'])
  assert.ok(problems('кaва').includes('mixed-script word'), 'a Latin homoglyph inside a Cyrillic word')
  assert.deepEqual(problems('Я купив новий CD.'), [], 'a whole Latin word is allowed')
  assert.deepEqual(problems('Множина від «hus» — «huse».'), [])
})

test('a sentence Ukrainian cannot read at all is rejected even with no Russian word', () => {
  assert.deepEqual(problems('Бзщ крхт влмн.'), ['not recognised as Ukrainian'])
})

test('a verb meaning is worded as a Ukrainian infinitive, which a Russian infinitive is not', () => {
  // `любить` and `заблудиться` are real Ukrainian words (third person), so only the part of
  // speech tells the Russian infinitive apart.
  for (const text of ['любить', 'заблудиться', 'приносить, доставлять', 'представлять себе', 'мочь'])
    assert.ok(ukrainianWordingProblems(text, 'verb', checkers).some((line) => line.startsWith('verb not a Ukrainian infinitive')), text)
  for (const text of ['любити', 'заблукати', 'приносити', 'уявляти собі', 'могти', 'їсти (обідати)', 'братися за', 'сміятись'])
    assert.deepEqual(ukrainianWordingProblems(text, 'verb', checkers), [], text)
  assert.deepEqual(ukrainianWordingProblems('любить', 'noun', checkers), [], 'only a verb meaning is held to it')
})

test('abbreviations and hand-checked dictionary gaps are not called Russian', () => {
  assert.deepEqual(problems('рік випуску (напр. вина)'), [])
  assert.deepEqual(problems('клятва'), [])
  assert.notDeepEqual(problems('Кошка спит.'), [], 'a sentence end is not an abbreviation')
})
