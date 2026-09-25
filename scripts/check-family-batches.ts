/**
 * The sentence-family gate (issue #16; spec #12 decision 16).
 *
 *   pnpm exec tsx scripts/check-family-batches.ts --fullforms <ddo-fullforms.csv> [--only batch-0007.json[,…]] [--candidates <file>] [--merge]
 *
 * Every family in every reply is checked against its work file, the published A1–B2 matrix, the
 * verified forms, Danish spelling (DDO full-form list, then the Hunspell dictionary) and the
 * frozen benchmark. A family that fails anything is **quarantined** in
 * `catalog/families/needs_review.jsonl` and never published. A batch below 95% clean fails the
 * run: stop and diagnose, do not publish around it.
 *
 * A reply may skip a sense it cannot write a safe family for, with a reason
 * (`{ "sense_id": "…", "skip": "…" }`). Skips are counted and reported, never hidden.
 *
 * `--candidates <file>` writes every clean family of every passing batch, the pool a seeded audit
 * is drawn from (`scripts/audit-families.ts --sample --published <file>`).
 *
 * `--merge` writes the clean families of every passing batch **that an audit approved in exactly
 * its current state** (`audit/passed.json`, written by `audit-families.ts --approve`) to
 * `published.jsonl`, the snapshot the importer loads. Re-running is idempotent: ids are derived
 * from content, so the same reply publishes the same rows.
 */
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { normalizeSentence, publishFamily, validateFamily, variantDanish, type CefrMatrix, type FamilyReply, type FamilyWorkSense } from '../lib/catalog-families'
import { parseFullForms } from '../lib/ddo-fullform'
import type { FamilyAuditApprovals } from '../lib/family-audit'
import { findMisspellings } from '../lib/spelling'

const argv = process.argv.slice(2)
const option = (flag: string): string | null => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null)
const fullFormsPath = option('--fullforms')
const only = option('--only')?.split(',') ?? null
const merge = argv.includes('--merge')
const candidatesPath = option('--candidates')
const root = option('--root') || 'catalog/families'
if (!fullFormsPath) {
  console.error('Usage: check-family-batches.ts --fullforms <ddo-fullforms.csv> [--only batch-NNNN.json[,…]] [--candidates file] [--merge] [--root dir]')
  process.exit(1)
}
const GATE = 0.95

const known = parseFullForms(await readFile(fullFormsPath, 'utf8')).known
const matrix = JSON.parse(await readFile('catalog/benchmark/cefr-matrix.json', 'utf8')) as CefrMatrix
const benchmark = new Set((await readFile('catalog/benchmark/unseen-tatoeba.tsv', 'utf8')).split(/\r?\n/u)
  .filter((line) => line && !line.startsWith('#')).map((line) => normalizeSentence(line.split('\t')[1] || '')))

const workDir = join(root, 'work')
const replyDir = join(root, 'out')
const names = (await readdir(workDir)).filter((name) => /^batch-\d+\.json$/.test(name) && (!only || only.includes(name))).sort()

// Spelling is asynchronous; every sentence is checked once up front and the answers passed in.
const replies = new Map<string, unknown[]>()
const replyShas = new Map<string, string>()
const sentences = new Set<string>()
for (const name of names) {
  const path = join(replyDir, name)
  if (!existsSync(path)) continue
  let value: unknown
  const text = await readFile(path, 'utf8')
  replyShas.set(name, createHash('sha1').update(text).digest('hex'))
  try { value = JSON.parse(text) } catch { value = null }
  const list = Array.isArray(value) ? value : []
  replies.set(name, list)
  for (const raw of list) {
    const family = raw as FamilyReply
    if (!Array.isArray(family?.variants) || typeof family.frame !== 'string') continue
    for (const variant of family.variants) {
      try {
        const danish = variantDanish(family, variant)
        if (danish) sentences.add(danish)
        // Accepted gap answers are spelled the same way, so they are checked up front too.
        for (const alternative of Array.isArray(variant.accepted) ? variant.accepted : []) if (typeof alternative === 'string' && alternative.trim()) sentences.add(alternative)
      } catch { /* malformed; validateFamily reports it */ }
    }
  }
}
const spelling = new Map<string, string[] | null>()
for (const sentence of sentences) {
  const found = await findMisspellings(sentence)
  spelling.set(sentence, found === null ? null : found.map((miss) => miss.word).filter((word) => !known.has(word.toLocaleLowerCase('da-DK'))))
}
const checks = { matrix, benchmark, unknownWords: (sentence: string) => spelling.has(sentence) ? spelling.get(sentence) ?? null : null }

// Senses are looked up across every work file, so regenerating the work files (which can shift a
// sense into a neighbouring batch) never strands a reply that was already written.
const works = new Map<string, FamilyWorkSense[]>()
for (const name of names) works.set(name, JSON.parse(await readFile(join(workDir, name), 'utf8')) as FamilyWorkSense[])
const allSenses = new Map([...works.values()].flat().map((sense) => [sense.sense_id, sense]))
if (only) for (const name of (await readdir(workDir)).filter((file) => /^batch-\d+\.json$/.test(file))) {
  for (const sense of JSON.parse(await readFile(join(workDir, name), 'utf8')) as FamilyWorkSense[]) allSenses.set(sense.sense_id, sense)
}

let pending = 0
let failedBatches = 0
const quarantined: string[] = []
const published: string[] = []
const candidates: string[] = []
const approvalsPath = 'catalog/families/audit/passed.json'
const approvals: FamilyAuditApprovals = existsSync(approvalsPath) ? JSON.parse(await readFile(approvalsPath, 'utf8')) as FamilyAuditApprovals : {}
let unapproved = 0
const covered = new Set<string>()
const totals = { families: 0, clean: 0, variants: 0, skipped: 0, uncovered: 0 }
for (const name of names) {
  const list = replies.get(name)
  if (!list) { pending += 1; continue }
  let clean = 0
  let families = 0
  const batchPublished: string[] = []
  const batchQuarantined: string[] = []
  for (const raw of list) {
    const record = raw as Record<string, unknown>
    if (record && typeof record.skip === 'string' && typeof record.sense_id === 'string' && allSenses.has(record.sense_id)) {
      covered.add(record.sense_id)
      totals.skipped += 1
      continue
    }
    families += 1
    const family = raw as FamilyReply
    const errors = validateFamily(raw, allSenses.get(family?.sense_id), checks)
    if (errors.length) {
      batchQuarantined.push(JSON.stringify({ batch: name, sense_id: family?.sense_id ?? null, lemma: family?.lemma ?? null, errors, family: raw }))
      continue
    }
    clean += 1
    covered.add(family.sense_id)
    const row = publishFamily(family)
    totals.variants += row.variants.length
    batchPublished.push(JSON.stringify({ ...row, batch: name }))
  }
  totals.families += families
  totals.clean += clean
  const rate = families ? clean / families : 0
  const ok = rate >= GATE
  if (!ok) failedBatches += 1
  if (!ok || batchQuarantined.length) {
    console.log(`${ok ? '·' : '✗'} ${name}: ${clean}/${families} clean (${(rate * 100).toFixed(1)}%)`)
    for (const line of batchQuarantined.slice(0, 8)) {
      const record = JSON.parse(line) as { lemma: string; errors: string[] }
      console.log(`    ${record.lemma}: ${record.errors.slice(0, 3).join(' | ')}`)
    }
  }
  quarantined.push(...batchQuarantined)
  // A batch below the gate publishes nothing: its clean rows are suspect too. A passing batch is
  // an audit candidate, and published only once an audit approved this exact reply.
  if (ok) {
    candidates.push(...batchPublished)
    if (approvals[join(replyDir, name)]?.sha1 === replyShas.get(name)) published.push(...batchPublished)
    else unapproved += 1
  }
}
for (const name of names) {
  if (!replies.has(name)) continue
  const missing = (works.get(name) || []).filter((sense) => !covered.has(sense.sense_id))
  totals.uncovered += missing.length
  if (missing.length) console.log(`· ${name}: ${missing.length} sense(s) with no family or skip: ${missing.slice(0, 6).map((sense) => sense.lemma).join(', ')}`)
}
console.log(`${names.length - pending}/${names.length} batches answered · ${failedBatches} below the ${GATE * 100}% gate`)
console.log(`${totals.clean}/${totals.families} families clean · ${totals.variants} sentences · ${totals.skipped} skipped · ${totals.uncovered} senses not answered · ${quarantined.length} quarantined`)

if (!only) await writeFile(join(root, 'needs_review.jsonl'), quarantined.length ? `${quarantined.join('\n')}\n` : '')
if (candidatesPath) {
  await writeFile(candidatesPath, candidates.length ? `${candidates.join('\n')}\n` : '')
  console.log(`${candidates.length} candidate families → ${candidatesPath}`)
}
if (merge) {
  console.log(`${unapproved} passing batch(es) not approved by an audit in their current state; left out`)
  if (!published.length) {
    console.error('Refusing to write an empty snapshot.')
    process.exit(1)
  }
  await writeFile(join(root, 'published.jsonl'), `${published.join('\n')}\n`)
  console.log(`Published ${published.length} families to ${join(root, 'published.jsonl')}`)
}
process.exitCode = failedBatches ? 1 : 0
