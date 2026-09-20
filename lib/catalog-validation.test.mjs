import assert from 'node:assert/strict'
import test from 'node:test'
import { validateCatalogBatch } from './catalog-validation.ts'
import { isReadableCyrillic } from './pronunciation.ts'

const sources = {
  corLemmaHasPartOfSpeech: async () => true,
  findMisspellings: async () => [],
}

function wordFact(lemma = 'gulv') {
  return {
    lemma, kind: 'word', freq_rank: 1, pos: 'noun', gender: 'et',
    definite_singular: 'gulvet', indefinite_plural: 'gulve', ipa: '[ˈgɔl]',
  }
}

function wordRow(lemma = 'gulv') {
  return {
    lemma, kind: 'word', pronunciation: 'гол',
    senses: [{ ordinal: 1, text: 'пол', pos: 'noun', gender: 'et', example: `Bogen ligger på ${lemma}et.`, example_translation: 'Книга лежит на полу.' }],
  }
}

function codes(result, row = 0) {
  return result.rows[row].failures.map((failure) => failure.code)
}

test('Cyrillic validator permits reading marks but rejects every non-Cyrillic letter', () => {
  for (const value of ['сдэ́эди', 'сэфёли', 'трудно, сложно', 'дом (жильё)', '24 часа']) assert.equal(isReadableCyrillic(value), true, value)
  for (const value of ['фоклaa', 'гaнг', 'хoнклэл', 'дэ́aфо', 'áф-', 'сεл', '...']) assert.equal(isReadableCyrillic(value), false, value)
})

test('a fully source-backed row passes', async () => {
  const result = await validateCatalogBatch([wordFact()], [wordRow()], sources)
  assert.equal(result.clean_count, 1)
  assert.equal(result.clean_rate, 1)
  assert.equal(result.stop, false)
  assert.deepEqual(codes(result), [])
})

test('pronunciation, source POS and source gender are fail-closed facts', async () => {
  const fact = { ...wordFact(), ipa: null }
  const row = wordRow()
  row.pronunciation = 'гулв'
  row.senses[0].pos = 'verb'
  row.senses[0].gender = 'en'
  // The register is what authorises a departing part of speech, so a stub that confirms
  // everything would authorise this one too. Here COR does not know `gulv` as a verb.
  const result = await validateCatalogBatch([fact], [row], {
    ...sources,
    corLemmaHasPartOfSpeech: async (_lemma, pos) => pos === 'noun',
  })
  assert.ok(codes(result).includes('pronunciation_without_ipa'))
  assert.ok(codes(result).includes('sense_pos_changed'))
  assert.ok(codes(result).includes('sense_gender_not_from_facts'))
})

test('a second word class is allowed exactly where the register lists one', async () => {
  // `dansk` is an adjective and a noun; a catalog row that carries both is right, and the first
  // pass's rule that every sense keeps the facts' part of speech was written before rows had
  // more than one meaning.
  const fact = { ...wordFact('dansk'), pos: 'adjective', gender: null, definite_singular: null, indefinite_plural: null }
  const row = {
    lemma: 'dansk', kind: 'word', pronunciation: 'данск',
    senses: [
      { ordinal: 1, text: 'датский', pos: 'adjective', gender: null, example: 'Han er dansk.', example_translation: 'Он датчанин.' },
      { ordinal: 2, text: 'датский язык', pos: 'noun', gender: null, example: 'Hun taler dansk.', example_translation: 'Она говорит по-датски.' },
    ],
  }
  const allowed = await validateCatalogBatch([fact], [row], {
    ...sources,
    corLemmaHasPartOfSpeech: async (_lemma, pos) => pos === 'adjective' || pos === 'noun',
  })
  assert.deepEqual(codes(allowed), [])

  // The same shape is refused when the register does not back the second class: `ved` is a
  // preposition, and the verb reading belongs to the lemma `vide`.
  const invented = await validateCatalogBatch([fact], [row], {
    ...sources,
    corLemmaHasPartOfSpeech: async (_lemma, pos) => pos === 'adjective',
  })
  assert.ok(codes(invented).includes('sense_pos_changed'))
})

test('a check that could not run never authorises a departing part of speech', async () => {
  const fact = { ...wordFact(), pos: 'noun' }
  const row = wordRow()
  row.senses[0].pos = 'verb'
  row.senses[0].gender = null
  const result = await validateCatalogBatch([fact], [row], {
    ...sources,
    corLemmaHasPartOfSpeech: async () => null,
  })
  assert.ok(codes(result).includes('cor_check_unavailable'))
})

test('mixed-script pronunciation and meanings fail even when they look Cyrillic', async () => {
  const row = wordRow()
  row.pronunciation = 'гaлв'
  row.senses[0].text = 'пoл'
  const result = await validateCatalogBatch([wordFact()], [row], sources)
  assert.ok(codes(result).includes('pronunciation_invalid_script'))
  assert.ok(codes(result).includes('sense_text_invalid'))
})

test('words require COR lemma+POS evidence; phrases skip COR entirely', async () => {
  const missing = await validateCatalogBatch([wordFact()], [wordRow()], {
    ...sources,
    corLemmaHasPartOfSpeech: async () => false,
  })
  assert.ok(codes(missing).includes('lemma_not_in_cor_for_pos'))

  const phraseFact = {
    lemma: 'godt lide', kind: 'phrase', freq_rank: null, pos: 'phrase', gender: null,
    definite_singular: null, indefinite_plural: null, ipa: null,
  }
  const phraseRow = {
    lemma: 'godt lide', kind: 'phrase', pronunciation: null,
    senses: [{ ordinal: 1, text: 'нравиться', pos: 'phrase', gender: null, example: 'Jeg kan godt lide kaffe.', example_translation: 'Мне нравится кофе.' }],
  }
  const phrase = await validateCatalogBatch([phraseFact], [phraseRow], {
    corLemmaHasPartOfSpeech: async () => { throw new Error('COR must not run for phrases') },
    findMisspellings: async () => [],
  })
  assert.equal(phrase.clean_count, 1)
})

test('a spelling null is check-not-run, never clean', async () => {
  const result = await validateCatalogBatch([wordFact()], [wordRow()], {
    ...sources,
    findMisspellings: async () => null,
  })
  assert.ok(codes(result).includes('spelling_check_unavailable'))
})

test('examples must be locatable by the same deterministic matcher used by practice', async () => {
  const row = wordRow()
  row.senses[0].example = 'Bogen ligger der.'
  const result = await validateCatalogBatch([wordFact()], [row], sources)
  assert.ok(codes(result).includes('example_missing_lemma'))
})

test('ordinals are contiguous and a row has at most three senses', async () => {
  const row = wordRow()
  row.senses.push({ ...row.senses[0], ordinal: 3, text: 'настил' })
  const result = await validateCatalogBatch([wordFact()], [row], sources)
  assert.ok(codes(result).includes('sense_ordinal_invalid'))

  const four = wordRow()
  four.senses = [1, 2, 3, 4].map((ordinal) => ({ ...four.senses[0], ordinal, text: `пол${'а'.repeat(ordinal)}` }))
  const tooMany = await validateCatalogBatch([wordFact()], [four], sources)
  assert.ok(codes(tooMany).includes('senses_invalid'))
})

test('batch order and length are hard requirements', async () => {
  const first = wordFact('gulv')
  const second = { ...wordFact('bord'), definite_singular: 'bordet', indefinite_plural: 'borde', ipa: '[ˈboɐ̯ˀ]' }
  const firstRow = wordRow('gulv')
  const secondRow = { ...wordRow('bord'), pronunciation: 'бор', senses: [{ ...wordRow('bord').senses[0], text: 'стол', example: 'Bogen ligger på bordet.', example_translation: 'Книга лежит на столе.' }] }

  const reordered = await validateCatalogBatch([first, second], [secondRow, firstRow], sources)
  assert.ok(codes(reordered, 0).includes('lemma_mismatch'))
  assert.ok(codes(reordered, 1).includes('lemma_mismatch'))

  const short = await validateCatalogBatch([first, second], [firstRow], sources)
  assert.ok(codes(short, 0).includes('batch_length_mismatch'))
  assert.ok(codes(short, 1).includes('batch_length_mismatch'))
})

test('95% clean is accepted, anything below 95% stops the batch', async () => {
  const facts = Array.from({ length: 40 }, (_, index) => ({
    lemma: `ord${index}`, kind: 'word', freq_rank: index + 1, pos: 'noun', gender: 'et',
    definite_singular: `ord${index}et`, indefinite_plural: `ord${index}`, ipa: '[o]',
  }))
  const rows = facts.map((fact) => ({
    lemma: fact.lemma, kind: 'word', pronunciation: 'о',
    senses: [{ ordinal: 1, text: 'слово', pos: 'noun', gender: 'et', example: `Et ${fact.lemma} er her.`, example_translation: 'Слово здесь.' }],
  }))

  rows[0].pronunciation = 'o'
  rows[1].pronunciation = 'o'
  const exactly = await validateCatalogBatch(facts, rows, sources)
  assert.equal(exactly.clean_count, 38)
  assert.equal(exactly.clean_rate, 0.95)
  assert.equal(exactly.stop, false)

  rows[2].pronunciation = 'o'
  const below = await validateCatalogBatch(facts, rows, sources)
  assert.equal(below.clean_count, 37)
  assert.equal(below.stop, true)
})

test('the register rescues an example the matcher cannot see through', async () => {
  // `Hun kan svømme` is a correct example of `kunne`, and no string comparison will say so.
  const fact = { ...wordFact('kunne'), pos: 'verb', gender: null, definite_singular: null, indefinite_plural: null }
  const row = {
    lemma: 'kunne', kind: 'word', pronunciation: 'куне',
    senses: [{ ordinal: 1, text: 'мочь', pos: 'verb', gender: null, example: 'Hun kan svømme.', example_translation: 'Она умеет плавать.' }],
  }
  const withoutRegister = await validateCatalogBatch([fact], [row], sources)
  assert.ok(codes(withoutRegister).includes('example_missing_lemma'))

  const withRegister = await validateCatalogBatch([fact], [row], {
    ...sources,
    exampleContainsLemma: async () => true,
  })
  assert.deepEqual(codes(withRegister), [])
})

test('a register that cannot answer does not rescue anything', async () => {
  const fact = { ...wordFact('kunne'), pos: 'verb', gender: null, definite_singular: null, indefinite_plural: null }
  const row = {
    lemma: 'kunne', kind: 'word', pronunciation: 'куне',
    senses: [{ ordinal: 1, text: 'мочь', pos: 'verb', gender: null, example: 'Hun kan svømme.', example_translation: 'Она умеет плавать.' }],
  }
  for (const answer of [null, false]) {
    const result = await validateCatalogBatch([fact], [row], {
      ...sources,
      exampleContainsLemma: async () => answer,
    })
    assert.ok(codes(result).includes('example_missing_lemma'), String(answer))
  }
})
