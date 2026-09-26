/**
 * Phrase expansion, selection and facts (issue #28). Zero model tokens.
 *
 * Picks the next catalog phrases from the rights-cleared inventory (`catalog/phrases/inventory.jsonl`,
 * most attested first) that DeepSeek labelled a learnable unit at A1–B2 and the catalog does not
 * hold yet, derives their facts, and writes them as pipeline batches for `content-batch.ts`:
 *
 * - forms: the head verb's COR paradigm with the other words fixed, `sig` expanded, and a split
 *   form after each finite head (`står … op`); a verb phrase COR has no paradigm for is passed over;
 * - IPA for the Cyrillic hint: Wiktionary's IPA of the whole phrase when it has one, otherwise the
 *   recorded IPA of each word (DDO, then Wiktionary when its readings agree). A phrase with a word
 *   no source transcribes is passed over rather than given a hint read off spelling (AGENTS.md §8).
 *
 * The frozen benchmark is never read here: selection follows attestation, which excluded it.
 *
 *   pnpm exec tsx scripts/plan-phrase-batches.ts --kaikki <kaikki.org-dictionary-Danish.jsonl> \
 *     --count 700 --size 50 --first 1 [--existing]
 *
 * `--existing` also writes the forms of the phrases already in the catalog
 * (`catalog/phrases/forms-existing.jsonl`), so they are found by their forms too.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { phraseComponentIpa, phraseFormRows, phraseStressIndex, PHRASE_GAP, type PhraseCandidate, type PhraseFormRow, type PhraseLabel } from '../lib/catalog-phrases'
import { parseKaikkiLine, selectIpaForPos, type WiktionaryIpa } from '../lib/catalog-ipa'
import { corParadigm } from '../lib/cor'
import type { PartOfSpeech } from '../lib/types'
import { corRowsFor } from './catalog-db'

const argv = process.argv.slice(2)
const option = (flag: string): string | null => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null)
const kaikkiPath = option('--kaikki')
if (!kaikkiPath) {
  console.error('Usage: plan-phrase-batches.ts --kaikki <kaikki.org-dictionary-Danish.jsonl> [--count 700] [--size 50] [--first 1] [--existing]')
  process.exit(1)
}
const count = Number(option('--count') || '700')
const size = Number(option('--size') || '50')
const first = Number(option('--first') || '1')
const LEVELS = new Set(['A1', 'A2', 'B1', 'B2'])

interface PhraseFacts {
  lemma: string
  pos: PartOfSpeech
  shape: string
  type: string
  level: string
  attested: number
  ipa: string
  ipa_source: 'wiktionary' | 'components'
  /** Every recorded form, split ones included; empty for a phrase with no head verb. */
  form_rows: PhraseFormRow[]
}

const readLines = async (path: string): Promise<string[]> => (await readFile(path, 'utf8')).split('\n').filter(Boolean)
const inventory = (await readLines('catalog/phrases/inventory.jsonl')).map((line) => JSON.parse(line) as PhraseCandidate)
const labels = new Map((JSON.parse(await readFile('catalog/phrases/classified.json', 'utf8')) as { labels: (PhraseLabel & { phrase: string })[] }).labels.map((label) => [label.phrase, label]))
const existing = new Set((await readLines('catalog/phrases/facts.jsonl')).map((line) => (JSON.parse(line) as { lemma: string }).lemma))
// A phrase already given to an earlier batch stays with it, whatever became of it there.
const planned = new Set<string>()
for (const name of (await readdir(join('catalog', 'pipeline'))).filter((entry) => /^phrases-\d{4}$/u.test(entry))) {
  if (Number(name.slice(-4)) >= first) continue
  const batch = JSON.parse(await readFile(join('catalog', 'pipeline', name, 'batch.json'), 'utf8')) as { entries: { lemma: string }[] }
  for (const entry of batch.entries) planned.add(entry.lemma)
}

// IPA sources: DDO's transcription of the lemma, the word catalog's facts, then Wiktionary.
const ddoIpa = JSON.parse(await readFile('catalog/ddo-ipa.json', 'utf8')) as Record<string, string>
const factIpa = new Map((await readLines('catalog/facts.jsonl')).map((line) => JSON.parse(line) as { lemma: string; kind: string; ipa: string | null }).filter((fact) => fact.kind === 'word' && fact.ipa).map((fact) => [fact.lemma, fact.ipa as string]))
const wiktionary = new Map<string, WiktionaryIpa[]>()
for (const line of await readLines(kaikkiPath)) {
  const parsed = parseKaikkiLine(line)
  if (!parsed) continue
  const word = parsed.word.toLocaleLowerCase('da-DK')
  wiktionary.set(word, [...(wiktionary.get(word) || []), parsed])
}
const wordIpa = (word: string): string | null => ddoIpa[word] || factIpa.get(word) || selectIpaForPos(wiktionary.get(word) || [], null)
const phraseIpa = (candidate: PhraseCandidate): { ipa: string; ipa_source: PhraseFacts['ipa_source'] } | null => {
  const whole = selectIpaForPos(wiktionary.get(candidate.phrase) || [], null)
  if (whole) return { ipa: whole, ipa_source: 'wiktionary' }
  const joined = phraseComponentIpa(candidate.tokens, wordIpa)
  return joined ? { ipa: joined, ipa_source: 'components' } : null
}

const heads = [...new Set(inventory.map((candidate) => candidate.head).filter((head): head is string => head !== null))]
const corByLemma = new Map<string, Awaited<ReturnType<typeof corRowsFor>>>()
for (let at = 0; at < heads.length; at += 200) {
  for (const row of await corRowsFor(heads.slice(at, at + 200), 'lemma')) corByLemma.set(row.lemma, [...(corByLemma.get(row.lemma) || []), row])
}
const formRowsOf = (candidate: PhraseCandidate): PhraseFormRow[] => candidate.head
  ? phraseFormRows(candidate.tokens, candidate.head, corParadigm(corByLemma.get(candidate.head) || [], ['verb']))
  : []

const skipped: Record<string, number> = {}
const skip = (why: string): void => { skipped[why] = (skipped[why] ?? 0) + 1 }
const selected: PhraseFacts[] = []
for (const candidate of inventory) {
  if (selected.length >= count) break
  const label = labels.get(candidate.phrase)
  if (existing.has(candidate.phrase) || planned.has(candidate.phrase)) continue
  if (!label) { skip('not labelled'); continue }
  if (!label.unit || label.type === 'free') { skip('not a unit'); continue }
  if (!LEVELS.has(label.level)) { skip('beyond B2'); continue }
  const form_rows = formRowsOf(candidate)
  if (candidate.head && !form_rows.length) { skip('head verb has no COR paradigm'); continue }
  const ipa = phraseIpa(candidate)
  if (!ipa) { skip('a word has no recorded IPA'); continue }
  selected.push({ lemma: candidate.phrase, pos: candidate.pos as PartOfSpeech, shape: candidate.shape, type: label.type, level: label.level, attested: candidate.attested, ...ipa, form_rows })
}

// Every batch's facts, kept together: an earlier batch's lines stay, a re-planned batch's are replaced.
const kept = (await readLines('catalog/phrases/expansion.jsonl').catch(() => [] as string[])).filter((line) => planned.has((JSON.parse(line) as { lemma: string }).lemma))
await writeFile('catalog/phrases/expansion.jsonl', `${[...kept, ...selected.map((facts) => JSON.stringify(facts))].join('\n')}\n`)
console.log(`selected ${selected.length} phrases (${selected.filter((facts) => facts.ipa_source === 'wiktionary').length} with Wiktionary IPA of the whole phrase); passed over: ${JSON.stringify(skipped)}`)

/** The forms the generator and the gate may put into an example: contiguous ones only. */
const exampleForms = (facts: PhraseFacts): string[] => [...new Set([facts.lemma, ...facts.form_rows.map((row) => row.form_text).filter((form) => !form.includes(PHRASE_GAP))])].sort()

for (let index = 0; index * size < selected.length; index += 1) {
  const name = `phrases-${String(first + index).padStart(4, '0')}`
  const units = selected.slice(index * size, (index + 1) * size)
  await mkdir(join('catalog', 'pipeline', name), { recursive: true })
  const batch = {
    issue: 28,
    name,
    note: 'Issue #28: catalog phrases from the rights-cleared inventory, most attested first, labelled a unit at A1–B2. Facts (forms, IPA) from catalog/phrases/expansion.jsonl.',
    audio: false,
    audit: { seed: 2800 + first + index, size: 30 },
    entries: units.map((facts) => ({ lemma: facts.lemma, kind: 'phrase', pos: facts.pos, forms: exampleForms(facts), ipa: facts.ipa, ipa_source: facts.ipa_source, type: facts.type, stress: phraseStressIndex(facts.lemma.split(' '), facts.type), level: facts.level, form_rows: facts.form_rows })),
    families: [],
  }
  await writeFile(join('catalog', 'pipeline', name, 'batch.json'), `${JSON.stringify(batch, null, 1)}\n`)
  console.log(`${name}: ${units.length} phrases`)
}

if (argv.includes('--existing')) {
  const rows = inventory.filter((candidate) => existing.has(candidate.phrase)).map((candidate) => ({ lemma: candidate.phrase, form_rows: formRowsOf(candidate) })).filter((row) => row.form_rows.length)
  await writeFile('catalog/phrases/forms-existing.jsonl', `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`)
  console.log(`forms for ${rows.length} of ${existing.size} catalog phrases → catalog/phrases/forms-existing.jsonl`)
}
