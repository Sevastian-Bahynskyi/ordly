/**
 * Issue #6 step 6: drive `download_ddo_audio.py` through the catalog, 500 words at a time.
 *
 * The Python script is not modified and not reimplemented. It reads a `words.txt`, writes one MP3
 * per term and a JSON report; this runner decides what goes into each `words.txt`, calls it, reads
 * the report and records the batch. Ten thousand lookups in one run is one very long request
 * against a public dictionary with no API — five hundred is polite, and it is a place to stop.
 *
 * Usage:
 *
 *   node scripts/audio-batches.mjs --facts catalog/facts.jsonl --output catalog/audio
 *   node scripts/audio-batches.mjs --facts catalog/facts.jsonl --output catalog/audio --batches 2
 *   node scripts/audio-batches.mjs --facts catalog/facts.jsonl --output catalog/audio --dry-run
 *
 * Resumable by design: every completed batch is recorded in `catalog/audio-manifest.json` and
 * re-running continues from the first batch that is not `done`. A word that DDO has no recording
 * for is recorded as failed and **never blocks its catalog row** — the word is simply silent.
 *
 * Only words are sent. A phrase has no DDO headword at all: `godt lide` exists there as a fixed
 * expression under `lide`, with no audio of its own (issue #6 §2).
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { AUDIO_BATCH_SIZE, audioBatches, audioSummary, mergeHarvestedIpa, parseAudioReport, wordsFileContents } from '../lib/catalog-audio.ts'

const SCRIPT = 'download_ddo_audio.py'

function valueAfter(argv, flag) {
  const at = argv.indexOf(flag)
  return at >= 0 && at + 1 < argv.length ? argv[at + 1] : null
}

function positiveInteger(value, fallback, name) {
  if (value === null) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`)
  return parsed
}

async function readTerms(factsPath) {
  const text = await readFile(factsPath, 'utf8')
  const terms = []
  for (const line of text.split(/\r?\n/u)) {
    if (!line.trim()) continue
    const fact = JSON.parse(line)
    if (fact.kind !== 'word') continue
    terms.push({ lemma: String(fact.lemma), pos: fact.pos ?? null })
  }
  return terms
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return fallback
    throw error
  }
}

async function readManifest(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return { batch_size: AUDIO_BATCH_SIZE, batches: {} }
    throw error
  }
}

/** The report the script just wrote: its name carries a timestamp, so the newest one is ours. */
async function newestReport(outputDir, since) {
  const names = (await readdir(outputDir)).filter((name) => name.startsWith('ddo_audio_report_') && name.endsWith('.json'))
  let newest = null
  for (const name of names.sort()) {
    const path = join(outputDir, name)
    const text = await readFile(path, 'utf8')
    const report = JSON.parse(text)
    const created = Date.parse(report.created_at || '')
    if (Number.isFinite(created) && created >= since - 1000) newest = report
  }
  return newest
}

function runScript(wordsPath, outputDir, dryRun) {
  return new Promise((resolveRun, rejectRun) => {
    const args = [SCRIPT, wordsPath, '--output-dir', outputDir, '--skip-existing']
    if (dryRun) args.push('--dry-run')
    const child = spawn('python3', args, { stdio: 'inherit' })
    child.on('error', rejectRun)
    // Exit code 1 means some words failed, which is expected and not fatal: the report is what
    // decides, and a missing recording never blocks a row.
    child.on('close', (code) => (code === 0 || code === 1 ? resolveRun(code) : rejectRun(new Error(`${SCRIPT} exited with ${code}`))))
  })
}

async function main() {
  const argv = process.argv.slice(2)
  const factsPath = valueAfter(argv, '--facts') || 'catalog/facts.jsonl'
  const outputDir = valueAfter(argv, '--output') || 'catalog/audio'
  const wordsPath = valueAfter(argv, '--words') || 'words.txt'
  const manifestPath = valueAfter(argv, '--manifest') || 'catalog/audio-manifest.json'
  // The transcription rides along with the recording: the run is already on the DDO page, and the
  // article has already been matched by headword and part of speech. Feed this back into
  // build-catalog-facts with --ddo-ipa, and the catalog's pronunciations rest on real phonetics.
  const ipaPath = valueAfter(argv, '--ipa-out') || 'catalog/ddo-ipa.json'
  const size = positiveInteger(valueAfter(argv, '--size'), AUDIO_BATCH_SIZE, '--size')
  const maxBatches = positiveInteger(valueAfter(argv, '--batches'), Infinity, '--batches')
  const dryRun = argv.includes('--dry-run')

  if (!existsSync(SCRIPT)) throw new Error(`${SCRIPT} is not in the repo root; copy it there first`)

  const batches = audioBatches(await readTerms(factsPath), size)
  const manifest = await readManifest(manifestPath)
  manifest.batch_size = size
  await mkdir(outputDir, { recursive: true })

  let ran = 0
  for (let index = 0; index < batches.length; index += 1) {
    const key = String(index + 1).padStart(4, '0')
    if (manifest.batches[key]?.status === 'done') continue
    if (ran >= maxBatches) break

    const batch = batches[index]
    console.log(`\nBatch ${key}/${String(batches.length).padStart(4, '0')} — ${batch.length} words`)
    await writeFile(wordsPath, wordsFileContents(batch), 'utf8')
    manifest.batches[key] = { status: 'running', size: batch.length, started_at: new Date().toISOString() }
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

    const startedAt = Date.now()
    try {
      await runScript(wordsPath, outputDir, dryRun)
    } catch (error) {
      manifest.batches[key] = { status: 'failed', size: batch.length, error: String(error.message || error) }
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
      throw error
    }

    const report = await newestReport(resolve(outputDir), startedAt)
    const results = parseAudioReport(report)
    const summary = audioSummary(results)
    const harvested = mergeHarvestedIpa(await readJson(ipaPath, {}), results)
    await writeFile(ipaPath, `${JSON.stringify(harvested, null, 2)}\n`, 'utf8')
    manifest.batches[key] = {
      status: 'done',
      size: batch.length,
      finished_at: new Date().toISOString(),
      ...summary,
      files: Object.fromEntries(results.filter((result) => result.path).map((result) => [result.lemma, result.path])),
    }
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    console.log(`  saved ${summary.saved}, already present ${summary.skipped}, no recording ${summary.failed}`
      + ` · ${results.filter((result) => result.ipa).length} transcriptions harvested`)
    ran += 1
  }

  const done = Object.values(manifest.batches).filter((batch) => batch.status === 'done')
  const totals = done.reduce((sum, batch) => ({
    saved: sum.saved + (batch.saved || 0),
    skipped: sum.skipped + (batch.skipped || 0),
    failed: sum.failed + (batch.failed || 0),
  }), { saved: 0, skipped: 0, failed: 0 })
  console.log(`\n${done.length}/${batches.length} batches done — ${totals.saved} saved, ${totals.skipped} already present, ${totals.failed} without a recording.`)
  if (done.length < batches.length) console.log('Re-run to continue from the next batch.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Audio batch run failed')
  process.exitCode = 1
})
