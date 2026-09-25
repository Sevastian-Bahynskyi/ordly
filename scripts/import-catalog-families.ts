/**
 * Load the published sentence-family snapshot into the catalog (issue #16).
 *
 *   pnpm exec tsx scripts/import-catalog-families.ts                    # load through the linked CLI
 *   pnpm exec tsx scripts/import-catalog-families.ts --sql-dir <dir>    # write the chunk statements only
 *   … --published catalog/families/published.jsonl,catalog/expansion/families/published.jsonl
 *
 * Reads `catalog/families/published.jsonl` (or every snapshot named, as one), which only ever holds
 * families the gate accepted and an audit approved. One snapshot covers everything loaded: the
 * cleanup deletes whatever it lacks, so the catalog's and the expansion's families load together.
 * Chunks are idempotent upserts; the final cleanup removes families an older snapshot had, and
 * refuses to run unless every family of this snapshot is in the database.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { PublishedFamily } from '../lib/catalog-families'
import { familyChunkSql, familyCleanupSql, snapshotId } from '../lib/catalog-family-import'
import { query } from './catalog-db'

const argv = process.argv.slice(2)
const option = (flag: string): string | null => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null)
const path = option('--published') || 'catalog/families/published.jsonl'
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
const chunks: string[] = []
for (let start = 0; start < families.length; start += chunkSize) {
  chunks.push(familyChunkSql(families.slice(start, start + chunkSize), { snapshot, generator, gate: GATE }))
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
