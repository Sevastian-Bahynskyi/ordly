import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCatalogGeneratorPrompt,
  catalogGeneratorJsonSchema,
  parseCatalogFact,
  parseCatalogGeneratorText,
} from './catalog-contract.ts'

const fact = {
  lemma: 'gulv', kind: 'word', freq_rank: 2841, pos: 'noun', gender: 'et',
  definite_singular: 'gulvet', indefinite_plural: 'gulve', ipa: '[ˈgɔl]',
}

test('the issue-style fact is accepted without an ipa_source field', () => {
  assert.deepEqual(parseCatalogFact(fact), fact)
  assert.equal(parseCatalogFact({ ...fact, freq_rank: 1.5 }), null)
  assert.equal(parseCatalogFact({ ...fact, ipa_source: 'model' }), null)
})

test('the generator schema fixes batch length and forbids loose object shapes', () => {
  const schema = catalogGeneratorJsonSchema(40)
  assert.equal(schema.minItems, 40)
  assert.equal(schema.maxItems, 40)
  assert.equal(schema.items.additionalProperties, false)
  assert.equal(schema.items.properties.senses.maxItems, 3)
  assert.equal(schema.items.properties.senses.items.additionalProperties, false)
})

test('the prompt carries the source facts unchanged and mirrors the hard gate', () => {
  const prompt = buildCatalogGeneratorPrompt([fact])
  assert.match(prompt, /derived only from the supplied IPA/)
  assert.match(prompt, /If ipa is null, pronunciation must be null/)
  assert.match(prompt, /exact phrase contiguously/)
  assert.match(prompt, /Ordinals must be contiguous/)
  assert.match(prompt, /exactly 1 objects in exactly the input order/)
  assert.ok(prompt.endsWith(JSON.stringify([fact])))
})

test('manual/browser output must be a bare JSON array', () => {
  assert.deepEqual(parseCatalogGeneratorText('[{"lemma":"gulv"}]'), [{ lemma: 'gulv' }])
  assert.throws(() => parseCatalogGeneratorText('{"lemma":"gulv"}'), /JSON array/)
  assert.throws(() => parseCatalogGeneratorText('```json\n[]\n```'))
  assert.throws(() => parseCatalogGeneratorText('Here you go: []'))
})
