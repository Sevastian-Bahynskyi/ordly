import assert from 'node:assert/strict'
import test from 'node:test'
import { formLabel, sortedForms } from './word-forms.ts'

const form = (form_key, form_text) => ({ form_key, form_text })

test('review puts useful verb and adjective forms before the dictionary form', () => {
  const verbs = sortedForms([form('infinitive', 'skulle'), form('past_participle', 'skullet'), form('past', 'skulle'), form('present', 'skal')])
  assert.deepEqual(verbs.map((item) => item.form_key), ['present', 'past', 'past_participle', 'infinitive'])
  const adjectives = sortedForms([form('positive', 'lille'), form('superlative', 'mindst'), form('comparative', 'mindre')])
  assert.deepEqual(adjectives.map((item) => item.form_key), ['comparative', 'superlative', 'positive'])
  assert.equal(formLabel('superlative'), 'Superlative')
})
