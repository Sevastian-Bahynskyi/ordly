import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { audioObjectKey } from '../lib/catalog-audio'
import { literal, query } from './catalog-db'

const run = promisify(execFile)
const path = process.argv[2]
if (!path) throw new Error('Usage: tsx scripts/upload-word-audio.ts manifest.json [--dry-run]')
const manifest: unknown = JSON.parse(await readFile(path, 'utf8'))
if (!Array.isArray(manifest)) throw new Error('Expected an array of recordings')
for (const item of manifest) {
  if (!item || typeof item !== 'object') throw new Error('Invalid recording')
  const record = item as Record<string, unknown>
  const lemma = record.lemma
  const file = record.file
  const source = record.source
  if (typeof lemma !== 'string' || typeof file !== 'string' || source !== 'ddo') throw new Error('Invalid recording fields')
  const digest = createHash('sha1').update(lemma).digest('hex')
  const key = audioObjectKey(lemma, digest)
  if (process.argv.includes('--dry-run')) { console.log(`${lemma} (${source}) → ${key}`); continue }
  try {
    await run('supabase', ['storage', 'cp', '--experimental', '--linked', file, `ss:///word-audio/${key}`])
  } catch (error) {
    const output = error && typeof error === 'object' && 'stdout' in error ? String(error.stdout) : ''
    if (!output.includes('KeyAlreadyExists')) throw error
    const directory = await mkdtemp(join(tmpdir(), 'ordly-audio-'))
    try {
      const existing = join(directory, 'recording.mp3')
      await run('supabase', ['storage', 'cp', '--experimental', '--linked', `ss:///word-audio/${key}`, existing])
      const [localBytes, remoteBytes] = await Promise.all([readFile(file), readFile(existing)])
      if (!localBytes.equals(remoteBytes)) throw new Error(`Existing recording differs for ${lemma}`)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
  await query(`update public.vocabulary_entries set audio_path = ${literal(key)}, audio_source = ${literal(source)} where lower(danish) = ${literal(lemma)} and audio_path is null`)
  await query(`update public.word_catalog set audio_path = ${literal(key)} where lemma = ${literal(lemma)} and kind = 'word' and audio_path is null`)
  console.log(`${lemma}: uploaded ${source}`)
}
