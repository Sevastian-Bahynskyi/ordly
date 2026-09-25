/**
 * Coverage-targeted family work rows (issue #16): a plan names catalog senses and, for each, the
 * matrix cells still below threshold to write families for. The generator writes a family for the
 * cell it is given or skips; it never chooses the cell.
 *
 * Everything but the choice of sense and cell is read from gated data, never typed in. A word
 * sense's row is copied from its existing work row (catalog/families/work, the expansion's
 * families/work), which already carries its verified forms, wordings and level band. A phrase
 * sense is built from the phrase catalog rows, the English locale file and the phrase inventory
 * (the head verb's DDO forms with the rest of the phrase held fixed).
 *
 *   pnpm exec tsx scripts/write-target-family-work.ts --plan catalog/families/plans/batch-0104.json \
 *     --out catalog/families/work/batch-0104.json
 */
import { existsSync } from 'node:fs'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CatalogGeneratedRow } from '../lib/catalog-contract'
import { type CefrLevel, type FamilyWorkSense } from '../lib/catalog-families'
import { senseId } from '../lib/catalog-import'
import type { LocaleFile } from '../lib/catalog-locale'
import type { PhraseCandidate } from '../lib/catalog-phrases'

const argv = process.argv.slice(2)
const option = (flag: string): string | null => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null)
const planPath = option('--plan')
const outPath = option('--out')
const phraseRowsPaths = (option('--rows') || ['catalog/phrases/out/batch-0001.json', 'catalog/phrases/out/batch-0002.json'].filter(existsSync).join(',')).split(',').filter(Boolean)
if (!planPath || !outPath) {
  console.error('Usage: write-target-family-work.ts --plan <plan.json> --out <work/batch-NNNN.json> [--rows phrases/out/batch-0001.json,…]')
  process.exit(1)
}

interface PlanEntry { phrase?: string; lemma?: string; ordinal?: number; min_level?: CefrLevel; targets: { level: CefrLevel; situation: string; grammar: string; note?: string }[] }
const plan = (JSON.parse(await readFile(planPath, 'utf8')) as { entries: PlanEntry[] }).entries
const rows = new Map<string, CatalogGeneratedRow>()
for (const path of phraseRowsPaths) for (const row of JSON.parse(await readFile(path, 'utf8')) as CatalogGeneratedRow[]) rows.set(row.lemma, row)
const english = JSON.parse(await readFile('catalog/phrases/locale-en.json', 'utf8')) as LocaleFile
const inventory = new Map((await readFile('catalog/phrases/inventory.jsonl', 'utf8')).split('\n').filter(Boolean)
  .map((line) => JSON.parse(line) as PhraseCandidate).map((candidate) => [candidate.phrase, candidate]))

// Word senses: the gated work rows already written for them, keyed by sense id.
const wordRows = new Map<string, FamilyWorkSense>()
for (const root of ['catalog/families/work', 'catalog/expansion/families/work']) {
  if (!existsSync(root)) continue
  for (const name of (await readdir(root)).filter((file) => /^batch-\d+\.json$/.test(file))) {
    for (const row of JSON.parse(await readFile(join(root, name), 'utf8')) as (FamilyWorkSense & { target?: unknown; note?: unknown })[]) {
      if (row.kind !== 'word' || wordRows.has(row.sense_id)) continue
      const { target: _target, note: _note, ...sense } = row
      wordRows.set(row.sense_id, sense)
    }
  }
}

const work: (FamilyWorkSense & { target: { level: string; situation: string; grammar: string }; note?: string })[] = []
for (const entry of plan) {
  if (entry.lemma) {
    const id = senseId(entry.lemma, 'word', entry.ordinal ?? 1)
    const sense = wordRows.get(id)
    if (!sense) { console.error(`${entry.lemma} #${entry.ordinal ?? 1}: no gated work row for this sense — refused`); process.exit(1) }
    for (const target of entry.targets) work.push({ ...sense, target: { level: target.level, situation: target.situation, grammar: target.grammar }, ...(target.note ? { note: target.note } : {}) })
    continue
  }
  if (!entry.phrase || !entry.min_level) { console.error('a plan entry names a lemma, or a phrase with its min_level'); process.exit(1) }
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
      min_level: entry.min_level as CefrLevel, ru: sense.text, en, forms: candidate.forms,
      target: { level: target.level, situation: target.situation, grammar: target.grammar },
      ...(target.note ? { note: target.note } : {}),
    })
  }
}
await writeFile(outPath, `${JSON.stringify(work, null, 1)}\n`)
console.log(`${work.length} work rows for ${new Set(work.map((row) => row.sense_id)).size} senses → ${outPath}`)
