import assert from 'node:assert/strict'
import { test } from 'node:test'
import { corParadigm } from './cor.ts'

const row = (lemma, form, tag) => ({ lemma, form, tag })

test('keeps alternative noun forms and a gender distinction', () => {
  const forms = corParadigm([
    row('aften', 'aften', 'sb.fk.sg.ubest'),
    row('aften', 'aftener', 'sb.fk.pl.ubest'),
    row('aften', 'aftner', 'sb.fk.pl.ubest'),
  ], ['noun'], ['en'])
  assert.deepEqual(forms.filter((form) => form.form_key === 'indefinite_plural').map((form) => form.form_text), ['aftener', 'aftner'])
  assert.ok(forms.every((form) => form.gender === 'en'))
})

test('part of speech prevents unrelated homograph forms entering a paradigm', () => {
  const forms = corParadigm([
    row('du', 'du', 'pron.nom'),
    row('du', 'dig', 'pron.obl'),
    row('du', 'dur', 'vb.præs.akt'),
  ], ['pronoun'])
  assert.deepEqual(forms.map((form) => form.form_text), ['du', 'dig'])
})

test('ambiguous unclassified words get no guessed forms', () => {
  assert.deepEqual(corParadigm([row('du', 'du', 'pron.nom'), row('du', 'dur', 'vb.præs.akt')], []), [])
})
