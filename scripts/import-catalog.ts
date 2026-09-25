/**
 * Load the built catalog into `public.word_catalog` and `public.word_catalog_sense` (issue #6 §11).
 *
 * Reference data, exactly like COR: identical for every account, loaded by a script rather than by
 * a migration, and read-only to the app. This is the last step of the build and the only one that
 * writes to the database.
 *
 *   pnpm exec tsx scripts/import-catalog.ts --dry-run   # report what would be written
 *   pnpm exec tsx scripts/import-catalog.ts             # write it
 *
 * **Only rows the gate accepted are loaded.** Anything in `needs_review.jsonl` is left out, which
 * is the whole point of having a gate: a row that failed a check does not become a word the
 * learner is taught.
 *
 * Sense ids are derived, not random. `word_catalog_sense.sense_id` is permanent — an unlocked
 * entry inherits it, and practice objectives are keyed `entry:<id>:sense:<sid>` (AGENTS.md §20) —
 * so a second import must mint the same id for the same meaning. A UUIDv5-style digest of the
 * lemma, kind and ordinal does that without a table to remember it by.
 */
import { execFile } from 'node:child_process'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { parseCatalogFact, parseCatalogGeneratorText, type CatalogFact, type CatalogGeneratedRow } from '../lib/catalog-contract'
import { catalogCleanupSql, catalogEntriesJsonSql, catalogSensesJsonSql, senseId, type CatalogEntryRow, type CatalogSenseRow } from '../lib/catalog-import'
import { isGeneratedCatalogRow } from '../lib/catalog-validation'
import { literal, query } from './catalog-db'

/** Rows per statement. Each carries its senses, so this stays well inside the payload limit. */
const BATCH_SIZE = 250

function valueAfter(argv: string[], flag: string): string | null {
  const at = argv.indexOf(flag)
  return at >= 0 && at + 1 < argv.length ? argv[at + 1] : null
}

function sqlText(value: string | null): string {
  return value === null ? 'null' : literal(value)
}

async function readFacts(path: string): Promise<Map<string, CatalogFact>> {
  const text = await readFile(path, 'utf8')
  const facts = new Map<string, CatalogFact>()
  for (const line of text.split(/\r?\n/u)) {
    if (!line.trim()) continue
    const fact = parseCatalogFact(JSON.parse(line) as unknown)
    if (fact) facts.set(fact.lemma, fact)
  }
  return facts
}

async function readRejected(path: string): Promise<Set<string>> {
  try {
    const text = await readFile(path, 'utf8')
    const rejected = new Set<string>()
    for (const line of text.split(/\r?\n/u)) {
      if (!line.trim()) continue
      const record = JSON.parse(line) as { lemma?: unknown }
      if (typeof record.lemma === 'string') rejected.add(record.lemma)
    }
    return rejected
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Set()
    throw error
  }
}

/**
 * The recording key for each catalog row, from the Azure Speech manifest
 * (`scripts/synthesize-audio.ts`). Only clips the manifest records as uploaded are used, so a row
 * never points at an object that is not in the bucket.
 */
async function readAudio(path: string): Promise<Map<string, string>> {
  try {
    const manifest = JSON.parse(await readFile(path, 'utf8')) as { uses?: Record<string, string[]>; clips?: Record<string, { key: string; uploaded?: boolean }> }
    const audio = new Map<string, string>()
    for (const [text, uses] of Object.entries(manifest.uses || {})) {
      const clip = manifest.clips?.[text]
      if (!clip?.uploaded) continue
      for (const use of uses) audio.set(use, clip.key)
    }
    return audio
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Map()
    throw error
  }
}

interface CatalogRow {
  fact: CatalogFact
  row: CatalogGeneratedRow
  audioPath: string | null
}

function entryValues(entry: CatalogRow, generator: string): string {
  const { fact, row } = entry
  const primary = row.senses[0]
  return `(${[
    literal(fact.lemma),
    literal(fact.kind),
    fact.freq_rank === null ? 'null' : String(fact.freq_rank),
    sqlText(fact.pos),
    sqlText(fact.gender),
    sqlText(fact.definite_singular),
    sqlText(fact.indefinite_plural),
    sqlText(fact.ipa),
    sqlText(fact.ipa ? fact.ipa_source ?? null : null),
    sqlText(row.pronunciation),
    sqlText(entry.audioPath),
    sqlText(primary.example),
    sqlText(primary.example_translation),
    literal(generator),
  ].join(', ')})`
}

function senseValues(entry: CatalogRow): string[] {
  return entry.row.senses.map((sense) => {
    // The primary sense's example lives on the entry, so storing a copy here would let the two
    // drift apart — the same rule vocabulary_entries follows (AGENTS.md §20, D10).
    const isPrimary = sense.ordinal === 1
    return `(${[
      literal(entry.fact.lemma),
      literal(entry.fact.kind),
      `'${senseId(entry.fact.lemma, entry.fact.kind, sense.ordinal)}'::uuid`,
      String(sense.ordinal),
      `'ru'`,
      literal(sense.text),
      sqlText(sense.pos),
      sqlText(sense.gender),
      isPrimary ? 'null' : sqlText(sense.example),
      isPrimary ? 'null' : sqlText(sense.example_translation),
    ].join(', ')})`
  })
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const dryRun = argv.includes('--dry-run')
  const factsPath = valueAfter(argv, '--facts') || 'catalog/facts.jsonl'
  const outDir = valueAfter(argv, '--out') || 'catalog/out'
  const reviewPath = valueAfter(argv, '--needs-review') || 'catalog/needs_review.jsonl'
  const audioPath = valueAfter(argv, '--audio-manifest') || 'catalog/speech/manifest.json'
  const generator = valueAfter(argv, '--generator') || 'chatgpt+claude-sonnet-5, 2026-09'

  const facts = await readFacts(factsPath)
  const rejected = await readRejected(reviewPath)
  const audio = await readAudio(audioPath)

  const entries: CatalogRow[] = []
  const seen = new Set<string>()
  for (const name of (await readdir(outDir)).filter((file) => file.endsWith('.json')).sort()) {
    for (const value of parseCatalogGeneratorText(await readFile(join(outDir, name), 'utf8'))) {
      if (!isGeneratedCatalogRow(value)) continue
      if (rejected.has(value.lemma)) continue
      const fact = facts.get(value.lemma)
      if (!fact || fact.kind !== value.kind) continue
      const key = `${value.lemma}:${value.kind}`
      if (seen.has(key)) continue
      seen.add(key)
      entries.push({ fact, row: value, audioPath: audio.get(`${value.lemma}|${value.kind}`) ?? null })
    }
  }

  const senses = entries.flatMap(senseValues)
  const withAudio = entries.filter((entry) => entry.audioPath !== null).length
  console.log(`${entries.length.toLocaleString('en-US')} entries, ${senses.length.toLocaleString('en-US')} meanings`)
  console.log(`${withAudio.toLocaleString('en-US')} carry a recording · ${rejected.size} rejected rows left out`)
  if (dryRun) {
    console.log('\nDry run: nothing written.')
    return
  }

  // `--sql-dir` writes the upserts as JSON-payload statement files instead of running them, for a
  // session with no linked CLI. It is additive only: an expansion directory is not the whole
  // catalog, so the snapshot synchronization below (which deletes whatever the snapshot lacks)
  // never runs there, and neither does the paradigm sync (`scripts/catalog-paradigms-sql.ts`).
  const sqlDir = valueAfter(argv, '--sql-dir')
  if (sqlDir) {
    const entryRows: CatalogEntryRow[] = entries.map(({ fact, row, audioPath }) => ({
      lemma: fact.lemma, kind: fact.kind, freq_rank: fact.freq_rank, pos: fact.pos, gender: fact.gender,
      definite_singular: fact.definite_singular, indefinite_plural: fact.indefinite_plural, ipa: fact.ipa,
      ipa_source: fact.ipa ? fact.ipa_source ?? null : null, pronunciation: row.pronunciation, audio_path: audioPath,
      example_sentence: row.senses[0].example, example_translation: row.senses[0].example_translation, generator,
    }))
    const senseRows: CatalogSenseRow[] = entries.flatMap(({ fact, row }) => row.senses.map((sense) => ({
      lemma: fact.lemma, kind: fact.kind, sense_id: senseId(fact.lemma, fact.kind, sense.ordinal), ordinal: sense.ordinal, lang: 'ru',
      text: sense.text, pos: sense.pos, gender: sense.gender,
      // The primary sense's example lives on the entry (D10).
      example: sense.ordinal === 1 ? null : sense.example, example_translation: sense.ordinal === 1 ? null : sense.example_translation,
    })))
    const statements: string[] = []
    for (let start = 0; start < entryRows.length; start += BATCH_SIZE) statements.push(catalogEntriesJsonSql(entryRows.slice(start, start + BATCH_SIZE)))
    for (let start = 0; start < senseRows.length; start += BATCH_SIZE) statements.push(catalogSensesJsonSql(senseRows.slice(start, start + BATCH_SIZE)))
    await mkdir(sqlDir, { recursive: true })
    for (const [index, statement] of statements.entries()) await writeFile(join(sqlDir, `catalog-${String(index + 1).padStart(4, '0')}.sql`), `${statement};\n`)
    console.log(`Wrote ${statements.length} additive statements to ${sqlDir}; no snapshot synchronization.`)
    return
  }

  for (let start = 0; start < entries.length; start += BATCH_SIZE) {
    const chunk = entries.slice(start, start + BATCH_SIZE)
    await query(`insert into public.word_catalog
      (lemma, kind, freq_rank, pos, gender, definite_singular, indefinite_plural, ipa, ipa_source,
       pronunciation, audio_path, example_sentence, example_translation, generator)
      values ${chunk.map((entry) => entryValues(entry, generator)).join(', ')}
      on conflict (lemma, kind) do update set
        freq_rank = excluded.freq_rank, pos = excluded.pos, gender = excluded.gender,
        definite_singular = excluded.definite_singular, indefinite_plural = excluded.indefinite_plural,
        ipa = excluded.ipa, ipa_source = excluded.ipa_source, pronunciation = excluded.pronunciation,
        audio_path = excluded.audio_path, example_sentence = excluded.example_sentence,
        example_translation = excluded.example_translation, built_at = now(), generator = excluded.generator`)
    console.log(`  entries ${Math.min(start + BATCH_SIZE, entries.length)}/${entries.length}`)
  }

  for (let start = 0; start < senses.length; start += BATCH_SIZE) {
    const chunk = senses.slice(start, start + BATCH_SIZE)
    await query(`insert into public.word_catalog_sense
      (lemma, kind, sense_id, ordinal, lang, text, pos, gender, example, example_translation)
      values ${chunk.join(', ')}
      on conflict (lemma, kind, sense_id, lang) do update set
        ordinal = excluded.ordinal, text = excluded.text, pos = excluded.pos, gender = excluded.gender,
        example = excluded.example, example_translation = excluded.example_translation`)
    console.log(`  meanings ${Math.min(start + BATCH_SIZE, senses.length)}/${senses.length}`)
  }

  // Synchronize the exact validated snapshot. Upsert alone cannot remove a vanished third sense,
  // and the old cleanup only removed orphaned senses while leaving removed entries in place.
  await query(catalogCleanupSql(entries.map((entry) => ({
    lemma: entry.fact.lemma,
    kind: entry.fact.kind,
    senseIds: entry.row.senses.map((sense) => senseId(entry.fact.lemma, entry.fact.kind, sense.ordinal)),
  }))))

  const counts = await query(`select
    (select count(*) from public.word_catalog) as entries,
    (select count(*) from public.word_catalog_sense) as senses,
    (select count(*) from public.word_catalog where audio_path is not null) as with_audio`)
  console.log(`\nLoaded: ${JSON.stringify(counts[0])}`)
  const { stdout } = await promisify(execFile)('pnpm', ['exec', 'tsx', 'scripts/sync-word-paradigms.ts'], { maxBuffer: 4 * 1024 * 1024 })
  process.stdout.write(stdout)
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Catalog import failed')
  process.exitCode = 1
})
