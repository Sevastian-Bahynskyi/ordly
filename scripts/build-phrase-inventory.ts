/**
 * Phrase inventory, deterministic stage (issue #16). Zero model tokens.
 *
 * Reads the three rights-cleared inventories that name Danish multi-word units, keeps the ones
 * whose every word DDO knows, derives each phrase's forms from its head verb's DDO-verified forms,
 * counts usage in Tatoeba (the frozen benchmark's sentences excluded) and ranks by that. Output is
 * the only list a later stage may choose phrases from. See catalog/phrases/README.md.
 *
 *   pnpm exec tsx scripts/build-phrase-inventory.ts \
 *     --framenet framenetdata_1_0.csv --wikidata catalog/phrases/sources/wikidata-da-multiword.tsv \
 *     --fullforms ddo-fullforms_251126.csv --ranking freq-30k-ex.txt \
 *     --tatoeba dan_sentences.tsv --out catalog/phrases/inventory.jsonl
 */
import { readFile, writeFile } from 'node:fs/promises'
import {
  attestationCounter, comparePhraseCandidates, DDO_PHRASE_CATEGORY, declaredCategory, normalizePhrase, phraseForms,
  phraseHeadForms, phrasePartOfSpeech, phraseShape, WIKIDATA_PHRASE_CATEGORY, type PhraseCandidate, type PhraseRejection, type PhraseSource,
} from '../lib/catalog-phrases'
import { formsOf, fullFormKey, parseFullForms } from '../lib/ddo-fullform'

const argv = process.argv.slice(2)
const option = (flag: string): string | null => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null)
const paths = {
  framenet: option('--framenet'), wikidata: option('--wikidata'), fullforms: option('--fullforms'),
  ranking: option('--ranking'), tatoeba: option('--tatoeba'),
  benchmark: option('--benchmark') || 'catalog/benchmark/unseen-tatoeba.tsv',
  out: option('--out') || 'catalog/phrases/inventory.jsonl',
  // Unattested phrases are never selected (selection follows attestation), so the committed file
  // keeps attested ones only; `--min-attested 0` writes all of them.
  minAttested: Number(option('--min-attested') ?? '1'),
}
if (!paths.framenet || !paths.wikidata || !paths.fullforms || !paths.ranking || !paths.tatoeba) {
  console.error('Usage: build-phrase-inventory.ts --framenet <csv> --wikidata <tsv> --fullforms <csv> --ranking <freq-30k-ex.txt> --tatoeba <dan_sentences.tsv> [--out path]')
  process.exit(1)
}

const fullFormsText = await readFile(paths.fullforms, 'utf8')
const index = parseFullForms(fullFormsText)
const isVerb = (token: string): boolean => index.forms.has(fullFormKey(token, 'verb'))

// Form → lemmas, so a phrase word can be ranked by the lemma it is a form of (`stykker` → `stykke`).
const lemmasOfForm = new Map<string, Set<string>>()
// Form → verb lemmas. A head form two verbs share (`bor`: `bo` and `bore`) cannot attest either.
const verbsOfForm = new Map<string, Set<string>>()
const ddoMultiword: { phrase: string; ref: string; wordClass: string }[] = []
const DDO_PHRASE_CLASSES = new Set(['adv.', 'præp.', 'konj.', 'pron.', 'udråbsord', 'adj.'])
for (const line of fullFormsText.split(/\r?\n/u)) {
  const [form, lemma, , wordClass, id] = line.split('\t')
  if (!form || !lemma) continue
  const key = form.toLocaleLowerCase('da-DK')
  const set = lemmasOfForm.get(key) || new Set<string>()
  set.add(lemma.toLocaleLowerCase('da-DK'))
  lemmasOfForm.set(key, set)
  if (wordClass?.trim() === 'vb.') verbsOfForm.set(key, (verbsOfForm.get(key) || new Set<string>()).add(lemma.toLocaleLowerCase('da-DK')))
  if (form === lemma && lemma.includes(' ') && DDO_PHRASE_CLASSES.has(wordClass?.trim() || '')) ddoMultiword.push({ phrase: lemma, ref: `ddo:${id?.trim()}`, wordClass: wordClass.trim() })
}

const rank = new Map<string, number>()
;(await readFile(paths.ranking, 'utf8')).split(/\r?\n/u).forEach((line, at) => {
  const [, lemma] = line.split('\t')
  if (lemma && !rank.has(lemma.toLocaleLowerCase('da-DK'))) rank.set(lemma.toLocaleLowerCase('da-DK'), at + 1)
})
function tokenRank(token: string): number | null {
  const ranks = [token, ...(lemmasOfForm.get(token) || [])].map((lemma) => rank.get(lemma)).filter((value): value is number => value !== undefined)
  return ranks.length ? Math.min(...ranks) : null
}

// Tatoeba minus the frozen benchmark: attestation must not read the sentences coverage is scored on.
const benchmarkIds = new Set((await readFile(paths.benchmark, 'utf8')).split(/\r?\n/u).filter((line) => line && !line.startsWith('#')).map((line) => line.split('\t')[0]))
const corpus = (await readFile(paths.tatoeba, 'utf8')).split(/\r?\n/u)
  .map((line) => line.split('\t'))
  .filter(([id, lang, text]) => id && lang === 'dan' && text && !benchmarkIds.has(id))
  .map(([, , text]) => text)
const attested = attestationCounter(corpus)

// Raw records from each source.
const raw: { text: string; source: PhraseSource }[] = []
const framenetLines = (await readFile(paths.framenet, 'utf8')).split(/\r?\n/u)
for (const line of framenetLines.slice(1)) {
  const [id, , expression, , , coreVerb] = line.split('\t')
  // FrameNet names the expression's core verb; it declares a verb phrase only when that verb leads.
  const leadsWithCoreVerb = coreVerb && coreVerb !== 'NULL' && expression?.trim().toLocaleLowerCase('da-DK').split(/\s+/u)[0] === coreVerb.trim().toLocaleLowerCase('da-DK')
  if (id && expression) raw.push({ text: expression, source: { source: 'dsl-framenet-1.0', ref: `framenet:${id}`, ...(leadsWithCoreVerb ? { category: 'verb' as const } : {}) } })
}
// Nouns, proper nouns, noun phrases (species names) and proverbs are not what this pass teaches.
const WIKIDATA_EXCLUDED = new Set(['Q1084', 'Q147276', 'Q1401131', 'Q35102', 'Q503992', 'Q5456361'])
for (const line of (await readFile(paths.wikidata, 'utf8')).split(/\r?\n/u)) {
  const match = /entity\/(L\d+)>\t"(.+)"@da\t<http:\/\/www\.wikidata\.org\/entity\/(Q\d+)>/u.exec(line)
  const category = match ? WIKIDATA_PHRASE_CATEGORY[match[3]] : undefined
  if (match && !WIKIDATA_EXCLUDED.has(match[3])) raw.push({ text: match[2], source: { source: 'wikidata-lexemes', ref: `wikidata:${match[1]}`, ...(category ? { category } : {}) } })
}
for (const entry of ddoMultiword) {
  const category = DDO_PHRASE_CATEGORY[entry.wordClass]
  raw.push({ text: entry.phrase, source: { source: 'ddo-fullforms', ref: entry.ref, ...(category ? { category } : {}) } })
}

const rejected: Record<PhraseRejection | 'no-verified-head-forms', number> = { 'not-multiword': 0, 'too-long': 0, 'bad-characters': 0, placeholder: 0, 'unknown-token': 0, 'no-verified-head-forms': 0 }
const grouped = new Map<string, { tokens: string[]; sources: PhraseSource[] }>()
for (const record of raw) {
  const normalized = normalizePhrase(record.text)
  if ('rejected' in normalized) { rejected[normalized.rejected] += 1; continue }
  const existing = grouped.get(normalized.phrase)
  if (existing) {
    if (existing.sources.length < 6 && !existing.sources.some((source) => source.ref === record.source.ref)) existing.sources.push(record.source)
    continue
  }
  if (normalized.tokens.some((token) => !index.known.has(token))) { rejected['unknown-token'] += 1; continue }
  grouped.set(normalized.phrase, { tokens: normalized.tokens, sources: [record.source] })
}
const byPhrase = new Map<string, PhraseCandidate>()
for (const [phrase, { tokens, sources }] of grouped) {
  const declared = declaredCategory(sources)
  const { shape, head } = phraseShape(tokens, isVerb, declared)
  const headForms = head ? phraseHeadForms(head, formsOf(index, head, 'verb')) : []
  if (head && headForms.length < 2) { rejected['no-verified-head-forms'] += 1; continue }
  const forms = phraseForms(tokens, head, headForms)
  const ranks = tokens.map(tokenRank)
  byPhrase.set(phrase, {
    phrase, tokens, shape, pos: phrasePartOfSpeech(shape, declared), head, forms, sources, attested: 0,
    component_rank: ranks.every((value) => value !== null) ? Math.max(...(ranks as number[])) : null,
  })
}
for (const candidate of byPhrase.values()) {
  const unambiguous = candidate.head
    ? candidate.forms.filter((form) => (verbsOfForm.get(form.split(' ')[0])?.size ?? 1) === 1)
    : candidate.forms
  candidate.attested = attested(unambiguous)
}

const candidates = [...byPhrase.values()].sort(comparePhraseCandidates)
await writeFile(paths.out, candidates.filter((candidate) => candidate.attested >= paths.minAttested).map((candidate) => JSON.stringify(candidate)).join('\n') + '\n')

const shapes: Record<string, number> = {}
for (const candidate of candidates) shapes[candidate.shape] = (shapes[candidate.shape] || 0) + 1
console.log(`raw records: ${raw.length} · corpus sentences: ${corpus.length} (benchmark excluded: ${benchmarkIds.size})`)
console.log(`kept ${candidates.length} distinct phrases; attested ≥1: ${candidates.filter((c) => c.attested > 0).length}, ≥3: ${candidates.filter((c) => c.attested >= 3).length}`)
console.log('shapes:', shapes)
console.log('rejected:', rejected)
