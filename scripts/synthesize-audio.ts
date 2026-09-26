/**
 * Recordings for every catalog word and phrase and every saved word or phrase, synthesized with
 * Azure Speech (issue #16). Sentences get none.
 *
 *   pnpm exec tsx --env-file=.env.corpus.local scripts/synthesize-audio.ts --collect     # texts from the linked database
 *   pnpm exec tsx --env-file=.env.corpus.local scripts/synthesize-audio.ts --synthesize  # resumable
 *   pnpm exec tsx --env-file=.env.corpus.local scripts/synthesize-audio.ts --upload      # new clips into word-audio/words/
 *   pnpm exec tsx --env-file=.env.corpus.local scripts/synthesize-audio.ts --sql <dir>   # statements that point rows at them
 *
 * Every clip is checked by speech recognition in Danish: a clip whose transcript is not the text
 * is re-synthesized with the second Danish voice, and one that still does not match is judged by
 * DeepSeek (a homophone the recogniser preferred, or a real problem). The judgement and the
 * transcript are kept in the manifest, so the check can be read later.
 *
 * `catalog/speech/manifest.json` holds catalog texts and is committed. Saved words are a learner's
 * own data, so they live in the untracked `catalog/speech/material.json`, and so do the clips.
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { SPEECH_FORMAT, SPEECH_VOICE, speechText } from '../lib/speech-audio'
import { ALTERNATE_VOICE, assess, judgeTranscripts, RATE, synthesizeChecked, throttledCount, tts, type Clip } from './speech-clip'
import { spendLine } from './spend-ledger'
import { queryJson } from './catalog-db'
import { uploadObject } from './storage-api'

const run = promisify(execFile)
const argv = process.argv.slice(2)
const option = (flag: string): string | null => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null)
const DIR = 'catalog/speech'
const CLIPS = join(DIR, 'clips', 'words')
const CATALOG_PATH = join(DIR, 'manifest.json')
const MATERIAL_PATH = join(DIR, 'material.json')

interface Manifest {
  voice: string
  format: string
  rate: string
  /** Catalog rows (lemma, kind) or saved entry ids that use each text, by speechText. */
  uses: Record<string, string[]>
  /** The spelling spoken for each text, as first written (a name keeps its capital). */
  spoken?: Record<string, string>
  clips: Record<string, Clip>
}

async function load(path: string): Promise<Manifest> {
  return existsSync(path) ? JSON.parse(await readFile(path, 'utf8')) as Manifest : { voice: SPEECH_VOICE, format: SPEECH_FORMAT, rate: RATE, uses: {}, clips: {} }
}
async function save(path: string, manifest: Manifest): Promise<void> {
  await mkdir(DIR, { recursive: true })
  await writeFile(path, `${JSON.stringify(manifest, null, 1)}\n`)
}

async function pool<T>(items: readonly T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) { const item = items[next++]; await work(item) }
  }))
}

if (argv.includes('--collect')) {
  const catalog = await load(CATALOG_PATH)
  const material = await load(MATERIAL_PATH)
  const rows = await queryJson<{ lemma: string; kind: string }>(`select lemma, kind from public.word_catalog`)
  catalog.uses = {}
  for (const row of rows) (catalog.uses[speechText(row.lemma)] ||= []).push(`${row.lemma}|${row.kind}`)
  const entries = await queryJson<{ id: string; danish: string }>(`select id, danish from public.vocabulary_entries where entry_kind = 'word' and btrim(danish) <> ''`)
  material.uses = {}
  material.spoken = {}
  for (const entry of entries) {
    const text = speechText(entry.danish)
    ;(material.uses[text] ||= []).push(entry.id)
    material.spoken[text] ||= entry.danish.normalize('NFC').trim().replace(/\s+/gu, ' ')
  }
  await save(CATALOG_PATH, catalog)
  await save(MATERIAL_PATH, material)
  console.log(`catalog: ${Object.keys(catalog.uses).length} texts for ${rows.length} rows · saved words/phrases: ${Object.keys(material.uses).length} texts for ${entries.length} entries`)
}

if (argv.includes('--synthesize')) {
  await mkdir(CLIPS, { recursive: true })
  const concurrency = Number(option('--concurrency') || 6)
  for (const path of [CATALOG_PATH, MATERIAL_PATH]) {
    const manifest = await load(path)
    const texts = Object.keys(manifest.uses).filter((text) => !manifest.clips[text] || !existsSync(join(DIR, 'clips', manifest.clips[text].key)))
    let done = 0
    await pool(texts, concurrency, async (text) => {
      const { clip, audio } = await synthesizeChecked(manifest.spoken?.[text] ?? text)
      await writeFile(join(DIR, 'clips', clip.key), audio)
      manifest.clips[text] = clip
      done += 1
      if (done % 10 === 0) await save(path, manifest)
      if (done % 200 === 0) console.log(`${path}: ${done}/${texts.length} · throttled ${throttledCount()} · ${spendLine()}`)
    })
    await save(path, manifest)
    const clips = Object.values(manifest.clips)
    console.log(`${path}: ${clips.length} clips, ${clips.filter((clip) => clip.match).length} heard as written, ${clips.filter((clip) => clip.voice !== SPEECH_VOICE).length} on the second voice`)
  }
}

/** The stored mp3, decoded to the 16 kHz mono PCM the assessment takes (macOS afconvert). */
async function decode(mp3Path: string): Promise<Buffer> {
  const wavPath = `${mp3Path}.wav`
  await run('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', mp3Path, wavPath])
  const wav = await readFile(wavPath)
  await run('rm', ['-f', wavPath])
  return wav
}

if (argv.includes('--assess')) {
  // Score every stored clip; a clip under the bar is re-made with the other voice and at normal
  // speed, and the best-scoring candidate replaces it. Scores are kept in the manifests.
  const BAR = Number(option('--bar') || 80)
  const concurrency = Number(option('--concurrency') || 6)
  for (const path of [CATALOG_PATH, MATERIAL_PATH]) {
    const manifest = await load(path)
    const clips = Object.values(manifest.clips).filter((clip) => clip.accuracy === undefined)
    let done = 0
    await pool(clips, concurrency, async (clip) => {
      const file = join(DIR, 'clips', clip.key)
      clip.accuracy = (await assess(await decode(file), clip.text)) ?? 0
      if (clip.accuracy < BAR) {
        for (const [voice, rate] of [[ALTERNATE_VOICE, RATE], [SPEECH_VOICE, '0%'], [ALTERNATE_VOICE, '0%']] as const) {
          if (voice === clip.voice && rate === clip.rate) continue
          const audio = await tts(clip.text, voice, SPEECH_FORMAT, rate)
          const candidate = `${file}.candidate.mp3`
          await writeFile(candidate, audio)
          const score = (await assess(await decode(candidate), clip.text)) ?? 0
          if (score > clip.accuracy) {
            await run('mv', [candidate, file])
            Object.assign(clip, { voice, rate, bytes: audio.length, accuracy: score, uploaded: false })
          } else await run('rm', ['-f', candidate])
          if (clip.accuracy >= BAR) break
        }
      }
      done += 1
      if (done % 20 === 0) await save(path, manifest)
      if (done % 500 === 0) console.log(`${path}: assessed ${done}/${clips.length} · throttled ${throttledCount()}`)
    })
    await save(path, manifest)
    const scores = Object.values(manifest.clips).map((clip) => clip.accuracy ?? 0).sort((a, b) => a - b)
    const at = (q: number): number => scores[Math.floor(q * (scores.length - 1))]
    console.log(`${path}: ${scores.length} clips · median ${at(0.5)} · p10 ${at(0.1)} · p1 ${at(0.01)} · ≥${BAR}: ${scores.filter((score) => score >= BAR).length} · <60: ${scores.filter((score) => score < 60).length}`)
  }
}

if (argv.includes('--judge')) {
  for (const path of [CATALOG_PATH, MATERIAL_PATH]) {
    const manifest = await load(path)
    await judgeTranscripts(Object.values(manifest.clips))
    await save(path, manifest)
    const judged = Object.values(manifest.clips).filter((clip) => clip.judged)
    console.log(`${path}: ${judged.length} judged — ${judged.filter((clip) => clip.judged?.verdict === 'homophone').length} homophone, ${judged.filter((clip) => clip.judged?.verdict === 'problem').length} problem · ${spendLine()}`)
  }
}

if (argv.includes('--upload')) {
  // Only clips not yet in the bucket are sent; a key already present is left as it is (keys carry
  // a digest of the text, so the same key is the same recording request).
  const manifests = await Promise.all([CATALOG_PATH, MATERIAL_PATH].map(async (path) => ({ path, manifest: await load(path) })))
  const sent = new Set<string>()
  const pending = manifests.flatMap(({ manifest }) => Object.values(manifest.clips)).filter((clip) => !clip.uploaded && !sent.has(clip.key) && sent.add(clip.key))
  let count = 0
  await pool(pending, 8, async (clip) => {
    await uploadObject('word-audio', clip.key, await readFile(join(DIR, 'clips', clip.key)), 'audio/mpeg')
    count += 1
    if (count % 500 === 0) console.log(`uploaded ${count}/${pending.length}`)
  })
  const present = new Set((await queryJson<{ name: string }>(`select name from storage.objects where bucket_id = 'word-audio' and name like 'words/%-azure.mp3'`)).map((row) => row.name))
  for (const { path, manifest } of manifests) {
    for (const clip of Object.values(manifest.clips)) clip.uploaded = present.has(clip.key)
    await save(path, manifest)
    const clips = Object.values(manifest.clips)
    console.log(`${path}: ${clips.filter((clip) => clip.uploaded).length}/${clips.length} in storage`)
  }
}

const sqlDir = option('--sql')
if (sqlDir) {
  await mkdir(sqlDir, { recursive: true })
  const catalog = await load(CATALOG_PATH)
  const material = await load(MATERIAL_PATH)
  const value = (text: string): string => `$q$${text}$q$`
  const catalogRows: string[] = []
  for (const [text, uses] of Object.entries(catalog.uses)) {
    const clip = catalog.clips[text]
    if (!clip?.uploaded) continue
    for (const use of uses) { const [lemma, kind] = use.split('|'); catalogRows.push(`(${value(lemma)}, ${value(kind)}, ${value(clip.key)})`) }
  }
  const entryRows: string[] = []
  for (const [text, ids] of Object.entries(material.uses)) {
    const clip = material.clips[text]
    if (!clip?.uploaded) continue
    for (const id of ids) entryRows.push(`('${id}'::uuid, ${value(clip.key)})`)
  }
  const chunks = (rows: string[], size: number): string[][] => Array.from({ length: Math.ceil(rows.length / size) }, (_, at) => rows.slice(at * size, (at + 1) * size))
  let index = 0
  for (const chunk of chunks(catalogRows, 1000)) await writeFile(join(sqlDir, `speech-${String(++index).padStart(3, '0')}-catalog.sql`), `update public.word_catalog c set audio_path = v.key from (values ${chunk.join(', ')}) as v(lemma, kind, key) where c.lemma = v.lemma and c.kind = v.kind;\n`)
  for (const chunk of chunks(entryRows, 1000)) await writeFile(join(sqlDir, `speech-${String(++index).padStart(3, '0')}-entries.sql`), `update public.vocabulary_entries e set audio_path = v.key, audio_source = 'azure' from (values ${chunk.join(', ')}) as v(id, key) where e.id = v.id;\n`)
  console.log(`${catalogRows.length} catalog rows and ${entryRows.length} saved entries → ${index} statements in ${sqlDir}`)
}
