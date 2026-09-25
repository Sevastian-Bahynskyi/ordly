/**
 * Family work rows for catalog phrases (issue #16), in the same shape and directory as every other
 * family batch, so the same generator, gate, review, audit and merge handle them.
 *
 * A plan names, per phrase sense, the matrix cells to write families for. Everything else is read
 * from gated data, never typed in: the sense id and wording from the phrase catalog rows and the
 * English locale file, and the verified forms from the phrase inventory (the head verb's DDO forms
 * with the rest of the phrase held fixed).
 *
 *   pnpm exec tsx scripts/write-phrase-family-work.ts --plan catalog/phrases/family-plan-0102.json \
 *     --out catalog/families/work/batch-0102.json
 */
import { readFile, writeFile } from 'node:fs/promises'
import type { CatalogGeneratedRow } from '../lib/catalog-contract'
import { type CefrLevel, type FamilyWorkSense } from '../lib/catalog-families'
import { senseId } from '../lib/catalog-import'
import type { LocaleFile } from '../lib/catalog-locale'
import type { PhraseCandidate } from '../lib/catalog-phrases'

const argv = process.argv.slice(2)
const option = (flag: string): string | null => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null)
const planPath = option('--plan')
const outPath = option('--out')
const phraseRowsPaths = (option('--rows') || 'catalog/phrases/out/batch-0001.json').split(',')
if (!planPath || !outPath) {
  console.error('Usage: write-phrase-family-work.ts --plan <plan.json> --out <work/batch-NNNN.json> [--rows phrases/out/batch-0001.json,…]')
  process.exit(1)
}

interface PlanEntry { phrase: string; ordinal?: number; min_level: CefrLevel; targets: { level: CefrLevel; situation: string; grammar: string; note?: string }[] }
const plan = (JSON.parse(await readFile(planPath, 'utf8')) as { entries: PlanEntry[] }).entries
const rows = new Map<string, CatalogGeneratedRow>()
for (const path of phraseRowsPaths) for (const row of JSON.parse(await readFile(path, 'utf8')) as CatalogGeneratedRow[]) rows.set(row.lemma, row)
const english = JSON.parse(await readFile('catalog/phrases/locale-en.json', 'utf8')) as LocaleFile
const inventory = new Map((await readFile('catalog/phrases/inventory.jsonl', 'utf8')).split('\n').filter(Boolean)
  .map((line) => JSON.parse(line) as PhraseCandidate).map((candidate) => [candidate.phrase, candidate]))

const work: (FamilyWorkSense & { target: { level: string; situation: string; grammar: string }; note?: string })[] = []
for (const entry of plan) {
  const row = rows.get(entry.phrase)
  const candidate = inventory.get(entry.phrase)
  const ordinal = entry.ordinal ?? 1
  const sense = row?.senses.find((item) => item.ordinal === ordinal)
  if (!row || !candidate || !sense) { console.error(`${entry.phrase} #${ordinal}: not a gated catalog phrase sense — refused`); process.exit(1) }
  const id = senseId(entry.phrase, 'phrase', ordinal)
  const en = english.senses.find((item) => item.sense_id === id)?.text ?? null
  for (const target of entry.targets) {
    work.push({
      lemma: entry.phrase, kind: 'phrase', sense_id: id, pos: sense.pos, gender: null, freq_rank: null,
      min_level: entry.min_level, ru: sense.text, en, forms: candidate.forms,
      target: { level: target.level, situation: target.situation, grammar: target.grammar },
      ...(target.note ? { note: target.note } : {}),
    })
  }
}
await writeFile(outPath, `${JSON.stringify(work, null, 1)}\n`)
console.log(`${work.length} work rows for ${new Set(work.map((row) => row.sense_id)).size} phrase senses → ${outPath}`)
