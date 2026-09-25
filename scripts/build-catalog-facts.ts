/**
 * Issue #6 step 1: everything a source can answer, written to `catalog/facts.jsonl`.
 *
 * This is layer 1 of §3 and it costs no model tokens at all. It answers, per lemma: frequency
 * rank (the ranking file), part of speech, gender, definite singular and indefinite plural (COR),
 * and IPA (the Wiktionary extract). Whatever it cannot settle stays null, and null travels: the
 * generator is forbidden from filling it (§8 rule 7) and the gate rejects a row that tried (§9).
 *
 * Usage:
 *
 *   # one-time, ~95 MB, Wiktionary/CC BY-SA — not committed
 *   curl -O https://kaikki.org/dictionary/Danish/kaikki.org-dictionary-Danish.jsonl
 *
 *   pnpm exec tsx scripts/build-catalog-facts.ts \
 *     --ranking ~/Downloads/lemmas.tsv \
 *     --ipa kaikki.org-dictionary-Danish.jsonl \
 *     --ddo-ipa catalog/ddo-ipa.json \
 *     --limit 10000 \
 *     --phrases catalog/phrases.txt \
 *     --out catalog/facts.jsonl
 *
 * `--phrases` is an optional plain list, one phrase per line; phrases carry no rank and are never
 * asked of COR, which holds no multi-word entries (§2).
 *
 * Re-running is safe and cheap: the file is rebuilt from its sources, never edited in place.
 */
import { createReadStream } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createInterface } from 'node:readline'
import type { CatalogFact } from '../lib/catalog-contract'
import { buildCatalogFact, catalogHeadword, resolvePartOfSpeech } from '../lib/catalog-facts'
import { parseKaikkiLine, selectCatalogIpa, type WiktionaryIpa } from '../lib/catalog-ipa'
import { parseRanking, type RankedLemma } from '../lib/catalog-ranking'
import { corLookupForm, parseCorForms, type CorForm } from '../lib/cor'
import { corRowsFor } from './catalog-db'

/** Lemmas per COR query. Each one rides in the statement, so this keeps the SQL a sane size. */
const COR_CHUNK = 400

function valueAfter(argv: string[], flag: string): string | null {
  const at = argv.indexOf(flag)
  return at >= 0 && at + 1 < argv.length ? argv[at + 1] : null
}

async function readPhrases(path: string | null): Promise<string[]> {
  if (!path) return []
  const text = await readFile(path, 'utf8')
  const seen = new Set<string>()
  for (const line of text.split(/\r?\n/u)) {
    const phrase = line.trim().toLocaleLowerCase('da-DK')
    if (phrase && !phrase.startsWith('#')) seen.add(phrase)
  }
  return [...seen]
}

/**
 * The Wiktionary extract, filtered to the lemmas being built, streamed rather than parsed whole.
 *
 * 95 MB of JSONL through `JSON.parse` in one go is the kind of cold-start cost §16 warns about,
 * and there is no reason to hold a word this build will never ask about.
 */
async function readIpaIndex(path: string, wanted: ReadonlySet<string>): Promise<Map<string, WiktionaryIpa[]>> {
  const index = new Map<string, WiktionaryIpa[]>()
  const lines = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity })
  for await (const line of lines) {
    const entry = parseKaikkiLine(line)
    if (!entry) continue
    const key = entry.word.toLocaleLowerCase('da-DK')
    if (!wanted.has(key)) continue
    const existing = index.get(key)
    if (existing) existing.push(entry)
    else index.set(key, [entry])
  }
  return index
}

async function readCorRows(lemmas: readonly string[], column: 'form' | 'lemma'): Promise<Map<string, CorForm[]>> {
  const rows = new Map<string, CorForm[]>()
  for (let start = 0; start < lemmas.length; start += COR_CHUNK) {
    const chunk = lemmas.slice(start, start + COR_CHUNK)
    const found = await corRowsFor(chunk, column)
    for (const row of parseCorForms(found)) {
      const key = row[column]
      const existing = rows.get(key)
      if (existing) existing.push(row)
      else rows.set(key, [row])
    }
  }
  return rows
}

function summarize(facts: readonly CatalogFact[]): string {
  const words = facts.filter((fact) => fact.kind === 'word')
  const nouns = words.filter((fact) => fact.pos === 'noun')
  const count = (predicate: (fact: CatalogFact) => boolean): string => {
    const hits = facts.filter(predicate).length
    return `${hits}/${facts.length} (${((hits / (facts.length || 1)) * 100).toFixed(1)}%)`
  }
  return [
    `  part of speech : ${count((fact) => fact.pos !== null)}`,
    `  IPA            : ${count((fact) => fact.ipa !== null)}`
      + ` — ${facts.filter((fact) => fact.ipa_source === 'ddo').length} DDO,`
      + ` ${facts.filter((fact) => fact.ipa_source === 'wiktionary').length} Wiktionary`,
    `  nouns          : ${nouns.length} of ${words.length} words`,
    `  gender         : ${nouns.filter((fact) => fact.gender !== null).length}/${nouns.length} nouns`,
    `  definite form  : ${nouns.filter((fact) => fact.definite_singular !== null).length}/${nouns.length} nouns`,
  ].join('\n')
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const rankingPath = valueAfter(argv, '--ranking')
  const ipaPath = valueAfter(argv, '--ipa')
  const ddoIpaPath = valueAfter(argv, '--ddo-ipa')
  if (!rankingPath) throw new Error('Required: --ranking <frequency list> [--ipa <kaikki jsonl>]')
  const rawLimit = valueAfter(argv, '--limit')
  const limit = rawLimit === null ? 10000 : Number(rawLimit)
  if (!Number.isInteger(limit) || limit < 1) throw new Error('--limit must be a positive integer')
  const outPath = valueAfter(argv, '--out') || 'catalog/facts.jsonl'

  const ranking: RankedLemma[] = parseRanking(await readFile(rankingPath, 'utf8'), { limit })
  if (!ranking.length) throw new Error('The ranking file produced no lemmas; check the format (pos\\tlemma\\tfrequency)')
  const phrases = await readPhrases(valueAfter(argv, '--phrases'))

  const wanted = new Set<string>([...ranking.map((entry) => entry.lemma), ...phrases])
  // Without the Wiktionary extract every IPA is null, and so, by rule, is every pronunciation.
  if (ipaPath) console.log(`Reading IPA for ${wanted.size.toLocaleString('en-US')} entries from ${ipaPath} …`)
  const ipaIndex = ipaPath ? await readIpaIndex(ipaPath, wanted) : new Map<string, WiktionaryIpa[]>()
  // DDO is the dictionary that defines Danish pronunciation, and its transcription came from the
  // article the audio run had already matched by headword and part of speech. Where it has an
  // answer it is preferred; Wiktionary fills the rest.
  const ddoIpa: Record<string, string> = ddoIpaPath
    ? JSON.parse(await readFile(ddoIpaPath, 'utf8')) as Record<string, string>
    : {}

  const lookupForms = [...new Set(ranking.map((entry) => corLookupForm(entry.lemma)).filter(Boolean))]
  console.log(`Reading COR for ${lookupForms.length.toLocaleString('en-US')} lemmas …`)
  const formRows = await readCorRows(lookupForms, 'form')
  const lemmaRows = await readCorRows(lookupForms, 'lemma')

  const facts: CatalogFact[] = []
  const seen = new Set<string>()
  const dropped: string[] = []
  const remapped: string[] = []
  for (const entry of ranking) {
    const key = corLookupForm(entry.lemma)
    const rows = formRows.get(key) || []

    // A corpus ranks the most frequent *forms* and calls them lemmas. The register disagrees
    // about roughly one word in sixty — `kan` is `kunne`, `mig` is `jeg`, `bror` is `broder` —
    // and building the corpus's word would contradict the rule that the dictionary form is the
    // only form a word can be saved in.
    const pos = resolvePartOfSpeech(rows, key, entry.pos)
    const headword = catalogHeadword(rows, key, pos)
    if (!headword) {
      dropped.push(entry.lemma)
      continue
    }
    if (headword !== key) remapped.push(`${entry.lemma}→${headword}`)
    // The dictionary form is usually already in the ranking under its own rank, and the higher
    // rank is the one worth keeping.
    if (seen.has(headword)) continue
    seen.add(headword)
    const candidates = ipaIndex.get(headword) || ipaIndex.get(entry.lemma) || []
    const fact = buildCatalogFact({
      lemma: headword,
      kind: 'word',
      freqRank: entry.rank,
      posHint: entry.pos,
      formRows: headword === key ? rows : formRows.get(headword) || [],
      lemmaRows: lemmaRows.get(headword) || lemmaRows.get(key) || [],
      ipa: null,
      ipaSource: null,
    })
    // The part of speech has to be settled before an IPA can be chosen, for the same reason it
    // has to be settled before a gender can be read: `ved` is two words with two pronunciations.
    const selectedIpa = selectCatalogIpa(ddoIpa[headword] || ddoIpa[entry.lemma], candidates, fact.pos)
    facts.push({ ...fact, ipa: selectedIpa.ipa, ipa_source: selectedIpa.source })
  }

  for (const phrase of phrases) {
    const selectedIpa = selectCatalogIpa(ddoIpa[phrase], ipaIndex.get(phrase) || [], 'phrase')
    facts.push(buildCatalogFact({
      lemma: phrase,
      kind: 'phrase',
      freqRank: null,
      posHint: 'phrase',
      formRows: [],
      lemmaRows: [],
      ipa: selectedIpa.ipa,
      ipaSource: selectedIpa.source,
    }))
  }

  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, `${facts.map((fact) => JSON.stringify(fact)).join('\n')}\n`, 'utf8')

  console.log(`\nWrote ${facts.length.toLocaleString('en-US')} facts to ${outPath}`)
  if (remapped.length) console.log(`  ${remapped.length} remapped to their dictionary form, e.g. ${remapped.slice(0, 6).join(', ')}`)
  if (dropped.length) console.log(`  ${dropped.length} dropped — the register could not name one single-word dictionary form: ${dropped.slice(0, 8).join(', ')}`)
  console.log(summarize(facts))
  const silent = facts.filter((fact) => fact.ipa === null).length
  if (silent) console.log(`\n${silent} entries have no IPA and must be generated with a null pronunciation (§8 rule 1).`)
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Fact build failed')
  process.exitCode = 1
})
