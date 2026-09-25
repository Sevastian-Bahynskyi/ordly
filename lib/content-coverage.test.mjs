import assert from 'node:assert/strict'
import test from 'node:test'
import { matrixCoverage, parseFrequencyList, supportKey, textCoverage, weightedCoverage } from './content-coverage.ts'

const list = ['T\ti\t0.5', 'V\tvære\t0.3', 'NP\tDanmark\t0.1', 'NC\tgulv\t0.15', 'A\tstor\t0.05'].join('\n')

test('weighted coverage counts a lemma only in a word class the catalog supports', () => {
  const { rows, excluded } = parseFrequencyList(list)
  assert.deepEqual(excluded, { NP: 1 })
  const supported = new Set([supportKey('i', 'preposition'), supportKey('gulv', 'noun'), supportKey('stor', 'noun')])
  const result = weightedCoverage(rows, supported)
  assert.equal(result.covered, 2, 'stor is supported as a noun, not as the adjective the list means')
  assert.ok(Math.abs(result.overall - 0.65 / 1.0) < 1e-9)
  assert.ok(Math.abs(result.open - 0.15 / 0.5) < 1e-9)
  assert.equal(result.closed, 1)
})

test('text coverage resolves forms to lemmas, and leaves unknown tokens out of the rate', () => {
  const forms = new Map([['gulvet', ['gulv']], ['er', ['være']], ['koldt', ['kold']]])
  const result = textCoverage(['Gulvet er koldt.', 'Peter er her.'], (token) => forms.get(token), new Set(['gulv', 'være', 'her']))
  assert.equal(result.unknownTokens, 1, 'Peter')
  assert.equal(result.tokens, 5)
  assert.equal(result.tokenCoverage, 4 / 5)
  assert.equal(result.lemmas, 4)
  assert.equal(result.sentenceCoverage, 0.5)
})

test('matrix cells are credited only for families at a listed level', () => {
  const cells = matrixCoverage({ situations: [{ id: 'home', levels: ['A1'] }], grammar: [{ id: 'noun-definite', levels: ['A1', 'A2'] }] }, [
    { level: 'A1', situation: 'home', grammar: 'noun-definite', variants: [1, 2] },
    { level: 'B1', situation: 'home', grammar: 'noun-definite', variants: [1] },
  ])
  assert.deepEqual(cells.map((cell) => [cell.id, cell.level, cell.families, cell.sentences]), [['home', 'A1', 1, 2], ['noun-definite', 'A1', 1, 2], ['noun-definite', 'A2', 0, 0]])
})

test('a list lemma the register files under another headword is credited through it, and reported apart', () => {
  const { rows } = parseFrequencyList(['P\tden\t0.6', 'P\tdet\t0.4'].join('\n'))
  const supported = new Set([supportKey('den', 'pronoun')])
  const result = weightedCoverage(rows, supported, (lemma) => (lemma === 'det' ? 'den' : null))
  assert.equal(result.overall, 1)
  assert.ok(Math.abs(result.viaHeadword - 0.4) < 1e-9)
  assert.equal(weightedCoverage(rows, supported).overall, 0.6)
})
