import { corLookupForm, corParadigm, corPartsOfSpeech, parseCorForms, type CorForm } from '../lib/cor'
import { queryJson, query, literal } from './catalog-db'
import type { NounGender, PartOfSpeech } from '../lib/types'

type CatalogRow = { lemma: string; pos: string | null; gender: string | null }
type SavedRow = { id: string; danish: string; catalog_lemma: string | null; senses: unknown }
type FormRow = { form_key: string; form_text: string; gender: string }

const dry = process.argv.includes('--dry-run')
const savedOnly = process.argv.includes('--saved-only')
const entryAt = process.argv.indexOf('--entry')
const entryId = entryAt >= 0 ? process.argv[entryAt + 1] : null
if (entryId && !/^[0-9a-f-]{36}$/i.test(entryId)) throw new Error('Invalid entry id')
const catalog = savedOnly ? [] : await queryJson<CatalogRow>(`select c.lemma, coalesce(s.pos, c.pos) as pos, coalesce(s.gender, c.gender) as gender from public.word_catalog c left join public.word_catalog_sense s on s.lemma = c.lemma and s.kind = c.kind and s.lang = 'ru' where c.kind = 'word'`)
const saved = await queryJson<SavedRow>(`select id, danish, catalog_lemma, senses from public.vocabulary_entries where entry_kind = 'word'${entryId ? ` and id = ${literal(entryId)}::uuid` : ''}`)
const lemmas = [...new Set([...catalog.map((row) => row.lemma), ...saved.map((row) => row.catalog_lemma || corLookupForm(row.danish))].filter(Boolean))]
const corByLemma = new Map<string, CorForm[]>()
for (let offset = 0; offset < lemmas.length; offset += 150) {
  const chunk = lemmas.slice(offset, offset + 150)
  const rows = parseCorForms(await queryJson<CorForm>(`select form, lemma, tag from public.cor_form where lemma in (${chunk.map(literal).join(',')})`))
  for (const row of rows) corByLemma.set(row.lemma, [...(corByLemma.get(row.lemma) || []), row])
}
const byCatalog = new Map<string, CatalogRow[]>()
for (const row of catalog) byCatalog.set(row.lemma, [...(byCatalog.get(row.lemma) || []), row])
const pos = (value: string | null): PartOfSpeech | null => value && ['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction', 'numeral', 'interjection', 'phrase'].includes(value) ? value as PartOfSpeech : null
const gender = (value: string | null): NounGender | null => value === 'en' || value === 'et' ? value : null
const catalogForms = new Map<string, FormRow[]>()
for (const [lemma, rows] of byCatalog) {
  const hints = [...new Set(rows.map((row) => pos(row.pos)).filter((value): value is PartOfSpeech => value !== null))]
  const genders = [...new Set(rows.map((row) => gender(row.gender)).filter((value): value is NounGender => value !== null))]
  const corRows = corByLemma.get(lemma) || []
  const matched = corRows.filter((row) => row.lemma === lemma && (!hints.length || corPartsOfSpeech(row.tag).some((part) => hints.includes(part))))
  catalogForms.set(lemma, corParadigm(matched, hints, genders))
}
const savedForms = new Map<string, FormRow[]>()
for (const entry of saved) {
  const lemma = entry.catalog_lemma || corLookupForm(entry.danish)
  const senses = Array.isArray(entry.senses) ? entry.senses.filter((sense): sense is { pos?: string; gender?: string; removed_at?: string | null } => Boolean(sense && typeof sense === 'object')) : []
  const hints = [...new Set(senses.filter((sense) => !sense.removed_at).map((sense) => pos(sense.pos || null)).filter((value): value is PartOfSpeech => value !== null))]
  const genders = [...new Set(senses.filter((sense) => !sense.removed_at).map((sense) => gender(sense.gender || null)).filter((value): value is NounGender => value !== null))]
  const matched = corByLemma.get(lemma) || []
  savedForms.set(entry.id, corParadigm(matched, hints, genders))
}
const catalogCount = [...catalogForms.values()].reduce((n, rows) => n + rows.length, 0)
const savedCount = [...savedForms.values()].reduce((n, rows) => n + rows.length, 0)
console.log(JSON.stringify({ catalogWords: byCatalog.size, catalogForms: catalogCount, catalogWithoutForms: [...catalogForms.values()].filter((rows) => !rows.length).length, savedWords: saved.length, savedForms: savedCount, savedWithoutForms: [...savedForms.values()].filter((rows) => !rows.length).length, dry }))
if (dry) process.exit(0)

const catalogValues = [...catalogForms].flatMap(([lemma, forms]) => forms.map((form) => `(${literal(lemma)},'word',${literal(form.form_key)},${literal(form.form_text)},${literal(form.gender)})`))
for (let offset = 0; offset < catalogValues.length; offset += 180) {
  await query(`insert into public.word_catalog_form (lemma, kind, form_key, form_text, gender) values ${catalogValues.slice(offset, offset + 180).join(',')} on conflict do nothing`)
}
const savedValues = [...savedForms].flatMap(([id, forms]) => forms.map((form) => `(${literal(id)}::uuid,${literal(form.form_key)},${literal(form.form_text)},${literal(form.gender)})`))
for (let offset = 0; offset < savedValues.length; offset += 180) {
  await query(`insert into public.word_forms (user_id, entry_id, form_key, form_text, gender, source) select e.user_id, v.entry_id, v.form_key, v.form_text, v.gender, 'cor' from (values ${savedValues.slice(offset, offset + 180).join(',')}) v(entry_id,form_key,form_text,gender) join public.vocabulary_entries e on e.id = v.entry_id on conflict do nothing`)
}
console.log('Paradigms synchronized')

// DDO's suppletive comparisons are absent from COR. Keep them in the reference catalog and
// already saved headwords when a fresh environment imports its catalog after the migrations.
const ddoComparisons = [
  ['lille', 'comparative', 'mindre', 'меньше, менее'],
  ['lille', 'superlative', 'mindst', 'самый маленький, меньше всего'],
  ['megen', 'comparative', 'mere', 'больше, ещё'],
  ['megen', 'superlative', 'mest', 'больше всего, наиболее'],
] as const
for (const [lemma, key, text, gloss] of ddoComparisons) {
  await query(`insert into public.word_catalog_form (lemma, kind, form_key, form_text, gender, source, gloss) select lemma, kind, ${literal(key)}, ${literal(text)}, '', 'ddo', ${literal(gloss)} from public.word_catalog where lemma = ${literal(lemma)} and kind = 'word' on conflict do nothing`)
  await query(`insert into public.word_forms (user_id, entry_id, form_key, form_text, gender, source, gloss) select user_id, id, ${literal(key)}, ${literal(text)}, '', 'ddo', ${literal(gloss)} from public.vocabulary_entries where danish = ${literal(lemma)} and entry_kind = 'word' on conflict do nothing`)
}
