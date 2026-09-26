/**
 * Load the published sentence-family snapshot into the catalog (issue #16).
 *
 *   pnpm exec tsx scripts/import-catalog-families.ts                    # load through the linked CLI
 *   pnpm exec tsx scripts/import-catalog-families.ts --sql-dir <dir>    # write the chunk statements only
 *   … --published catalog/families/published.jsonl,catalog/expansion/families/published.jsonl
 *
 * Reads `catalog/families/published.jsonl` and every batch the content pipeline published
 * (`catalog/pipeline/<batch>/publish/families.jsonl`, issue #27) — or every snapshot named, as one — which
 * only ever hold families the gate accepted and an audit approved. One snapshot covers everything loaded: the
 * cleanup deletes whatever it lacks, so the catalog's and the expansion's families load together.
 * Chunks are idempotent upserts; the final cleanup removes families an older snapshot had, and
 * refuses to run unless every family of this snapshot is in the database.
 *
 * Translation overlays beside the snapshot (`catalog/families/translations-<lang>.json`, issue #24)
 * are added to each variant whose Danish they still translate.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { PublishedFamily } from '../lib/catalog-families'
import { existsSync } from 'node:fs'
import { familyChunkSql, familyCleanupSql, snapshotId, type TranslationOverlay } from '../lib/catalog-family-import'
import { ukrainianProblems } from '../lib/ukrainian'
import { loadUkrainianCheckers } from '../lib/ukrainian-dictionaries'
import { query } from './catalog-db'

const argv = process.argv.slice(2)
const option = (flag: string): string | null => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null)
const pipelineDir = 'catalog/pipeline'
const pipelineBatches = existsSync(pipelineDir) ? (await readdir(pipelineDir)).sort().map((name) => join(pipelineDir, name, 'publish')).filter((dir) => existsSync(join(dir, 'families.jsonl'))) : []
const path = option('--published') || ['catalog/families/published.jsonl', ...pipelineBatches.map((dir) => join(dir, 'families.jsonl'))].join(',')
const sqlDir = option('--sql-dir')
const chunkSize = Number(option('--chunk') || 50)
const generator = option('--generator') || 'families-2026-09-25'
const GATE = 'check-family-batches v1'

const lines: string[] = []
for (const file of path.split(',')) lines.push(...(await readFile(file, 'utf8')).split(/\r?\n/u).filter((line) => line.trim()))
if (!lines.length) {
  console.error('Refusing to load an empty snapshot.')
  process.exit(1)
}
const snapshot = snapshotId(lines)
const families = lines.map((line) => JSON.parse(line) as PublishedFamily)
const extra: TranslationOverlay = {}
for (const lang of ['uk']) {
  for (const overlayPath of [`catalog/families/translations-${lang}.json`, ...pipelineBatches.map((dir) => join(dir, `translations-${lang}.json`))]) {
    if (existsSync(overlayPath)) extra[lang] = { ...extra[lang], ...JSON.parse(await readFile(overlayPath, 'utf8')) }
  }
}
if (extra.uk) {
  // The overlay was gated when it was written; it is checked again here because it is a file
  // anyone can edit, and a Russian sentence filed as Ukrainian must never reach the catalog.
  const spell = await loadUkrainianCheckers()
  const bad = Object.entries(extra.uk).filter(([, row]) => ukrainianProblems(row.uk || '', spell).length)
  if (bad.length) {
    console.error(`Refusing to load: ${bad.length} Ukrainian translation(s) fail the language check, e.g. ${bad.slice(0, 3).map(([id, row]) => `${id} "${row.uk}"`).join(', ')}`)
    process.exit(1)
  }
}
const chunks: string[] = []
for (let start = 0; start < families.length; start += chunkSize) {
  chunks.push(familyChunkSql(families.slice(start, start + chunkSize), { snapshot, generator, gate: GATE, extra }))
}
console.log(`${families.length} families, ${families.reduce((sum, family) => sum + family.variants.length, 0)} sentences, snapshot ${snapshot}, ${chunks.length} chunks`)

if (sqlDir) {
  await mkdir(sqlDir, { recursive: true })
  for (const [index, statement] of chunks.entries()) await writeFile(join(sqlDir, `families-${String(index + 1).padStart(4, '0')}.sql`), `${statement};\n`)
  await writeFile(join(sqlDir, 'families-cleanup.sql'), `-- run after every chunk; expected = sum of "families" reported by the chunks\n${familyCleanupSql(snapshot, families.length)};\n`)
  console.log(`Wrote ${chunks.length} chunk statements and the cleanup to ${sqlDir}`)
} else {
  let written = 0
  for (const [index, statement] of chunks.entries()) {
    const [counts] = await query(statement)
    written += Number(counts?.families || 0)
    console.log(`  chunk ${index + 1}/${chunks.length}: ${JSON.stringify(counts)}`)
  }
  if (written !== families.length) console.warn(`${families.length - written} families name a sense the catalog does not have; they were skipped.`)
  const [cleanup] = await query(familyCleanupSql(snapshot, written))
  console.log(`Cleanup: ${JSON.stringify(cleanup)}`)
}
