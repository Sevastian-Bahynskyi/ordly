/**
 * Put the recordings in the private bucket (issue #6 §11).
 *
 * Storage keys are ASCII and Danish is not, so a file cannot be uploaded under its own name:
 * `words/adfærd.mp3` is rejected outright. Each recording is staged under the key
 * `audioObjectKey` derives — a transliterated slug plus a digest of the real lemma, because
 * transliteration alone would put `få` and `faa` on the same object and one word would quietly
 * play the other's recording.
 *
 *   pnpm exec tsx scripts/upload-catalog-audio.ts --dry-run
 *   pnpm exec tsx scripts/upload-catalog-audio.ts
 *
 * The bucket is private; the app reaches a recording through a short-lived signed URL. Staging
 * copies rather than renames, so `catalog/audio/` stays as the run produced it.
 */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'
import { audioObjectKey } from '../lib/catalog-audio'

const run = promisify(execFile)
const BUCKET = 'word-audio'

function valueAfter(argv: string[], flag: string): string | null {
  const at = argv.indexOf(flag)
  return at >= 0 && at + 1 < argv.length ? argv[at + 1] : null
}

/** The lemma to local file map the audio run recorded, from its manifest. */
async function readManifest(path: string): Promise<Map<string, string>> {
  const manifest = JSON.parse(await readFile(path, 'utf8')) as {
    batches?: Record<string, { files?: Record<string, string> }>
  }
  const files = new Map<string, string>()
  for (const batch of Object.values(manifest.batches || {})) {
    for (const [lemma, file] of Object.entries(batch.files || {})) files.set(lemma, file)
  }
  return files
}

export function lemmaDigest(lemma: string): string {
  return createHash('sha1').update(lemma).digest('hex')
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const dryRun = argv.includes('--dry-run')
  const manifestPath = valueAfter(argv, '--manifest') || 'catalog/audio-manifest.json'
  // The CLI copies the staging directory *into* the destination, so the directory has to be
  // named after the prefix the keys use. Staging in `.upload` put every object under
  // `words/.upload/…`, which is not where anything looks for it.
  const stageRoot = valueAfter(argv, '--stage') || 'catalog/.upload'
  const stageDir = join(stageRoot, 'words')

  const files = await readManifest(manifestPath)
  const keys = new Map<string, string>()
  for (const [lemma, file] of files) keys.set(lemma, audioObjectKey(lemma, lemmaDigest(lemma)))

  const collisions = keys.size - new Set(keys.values()).size
  if (collisions) throw new Error(`${collisions} recordings would overwrite each other`)

  console.log(`${files.size.toLocaleString('en-US')} recordings → ${BUCKET}`)
  if (dryRun) {
    for (const [lemma, key] of [...keys].slice(0, 5)) console.log(`  ${lemma} → ${key}`)
    console.log('\nDry run: nothing staged or uploaded.')
    return
  }

  await rm(stageRoot, { recursive: true, force: true })
  await mkdir(stageDir, { recursive: true })
  let staged = 0
  const missing: string[] = []
  for (const [lemma, file] of files) {
    try {
      await copyFile(file, join(stageDir, basename(keys.get(lemma) as string)))
      staged += 1
    } catch {
      missing.push(lemma)
    }
  }
  // A recording the manifest names but the disk does not have is reported, never guessed at.
  if (missing.length) console.log(`${missing.length} recording(s) named in the manifest are not on disk`)
  console.log(`Staged ${staged.toLocaleString('en-US')} files, uploading …`)

  await run('supabase', ['storage', 'cp', '--recursive', stageDir, `ss:///${BUCKET}`, '--experimental'], {
    maxBuffer: 64 * 1024 * 1024,
  })
  await rm(stageRoot, { recursive: true, force: true })

  // The CLI uploads everything as a generic binary; the served content type comes from here.
  await run('supabase', ['db', 'query', '--linked',
    `update storage.objects set metadata = jsonb_set(metadata, '{mimetype}', '"audio/mpeg"')
     where bucket_id = '${BUCKET}' and metadata->>'mimetype' <> 'audio/mpeg'`])

  const { stdout } = await run('supabase', ['db', 'query', '--linked',
    `select count(*) as objects from storage.objects where bucket_id = '${BUCKET}'`])
  await writeFile(join('catalog', 'audio-keys.json'), `${JSON.stringify(Object.fromEntries(keys), null, 2)}\n`, 'utf8')
  console.log(stdout.slice(stdout.indexOf('{')).split('\n').filter((line) => line.includes('objects')).join(' '))
  console.log('Keys written to catalog/audio-keys.json')
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Audio upload failed')
  process.exitCode = 1
})
