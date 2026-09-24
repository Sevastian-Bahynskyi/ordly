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
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { audioObjectKey } from '../lib/catalog-audio'
import { parseCatalogFact, parseCatalogGeneratorText, type CatalogFact, type CatalogGeneratedRow } from '../lib/catalog-contract'
import { catalogCleanupSql } from '../lib/catalog-import'
import { isGeneratedCatalogRow } from '../lib/catalog-validation'
import { literal, query } from './catalog-db'

/** Rows per statement. Each carries its senses, so this stays well inside the payload limit. */
const BATCH_SIZE = 250

/** Namespace for the derived sense ids. Changing it re-mints every id, so it never changes. */
const SENSE_NAMESPACE = 'ordly.word_catalog.sense'

function valueAfter(argv: string[], flag: string): string | null {
  const at = argv.indexOf(flag)
  return at >= 0 && at + 1 < argv.length ? argv[at + 1] : null
}

/**
 * A stable uuid for one meaning of one entry.
 *
 * Derived from lemma, kind and ordinal — not from the meaning's text, because correcting a
 * translation must not strand the scheduling state attached to that meaning.
 */
export function senseId(lemma: string, kind: string, ordinal: number): string {
  const digest = createHash('sha1').update(`${SENSE_NAMESPACE}:${lemma}:${kind}:${ordinal}`).digest('hex')
  const variant = ((parseInt(digest.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `5${digest.slice(13, 16)}`,
    `${variant}${digest.slice(18, 20)}`,
    digest.slice(20, 32),
  ].join('-')
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

async function readAudio(path: string): Promise<Map<string, string>> {
  try {
    const manifest = JSON.parse(await readFile(path, 'utf8')) as { batches?: Record<string, { files?: Record<string, string> }> }
    const audio = new Map<string, string>()
    for (const batch of Object.values(manifest.batches || {})) {
      // The bucket key, not the local path: storage keys are ASCII and Danish is not, so the
      // uploader stores `adfærd.mp3` under a transliterated slug plus a digest of the lemma.
      // Both sides derive it the same way rather than passing a map around.
      for (const lemma of Object.keys(batch.files || {})) {
        audio.set(lemma, audioObjectKey(lemma, createHash('sha1').update(lemma).digest('hex')))
      }
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
  const audioPath = valueAfter(argv, '--audio-manifest') || 'catalog/audio-manifest.json'
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
      entries.push({ fact, row: value, audioPath: audio.get(value.lemma) ?? null })
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
