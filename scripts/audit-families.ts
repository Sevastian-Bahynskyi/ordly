/**
 * The seeded sentence-family audit (issue #16; spec #12 decision 16).
 *
 *   pnpm exec tsx scripts/audit-families.ts --sample --seed 2609 [--size 200] [--published catalog/families/published.jsonl]
 *   # an auditor fills `failures` in catalog/families/audit/verdicts-<seed>.json, then:
 *   pnpm exec tsx scripts/audit-families.ts --tally 2609
 *   # repair every finding in the replies, then:
 *   pnpm exec tsx scripts/audit-families.ts --approve 2609
 *
 * The sample, the verdicts and the tally are committed, so an audit can be redrawn, re-read by a
 * second auditor, or checked against the sentences it judged. The tally exits non-zero when a
 * stratum is below 95% clean: repair and redraw with a new seed, do not publish around it.
 *
 * `--approve` records, in `audit/passed.json`, the exact bytes of every batch reply the sample
 * was drawn from, and only when the tally passes and no finding is left as judged.
 * `check-family-batches.ts --merge` publishes approved batches only, so a reply edited after its
 * audit is not published until an audit covers it again.
 */
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { publishFamily, type FamilyReply, type PublishedFamily } from '../lib/catalog-families'
import { drawFamilyAudit, failingStrata, FAMILY_AUDIT_FAILURES, FAMILY_AUDIT_LABELS, tallyFamilyAudit, unrepairedFindings, type FamilyAuditApprovals, type FamilyAuditItem, type FamilyAuditVerdict } from '../lib/family-audit'

const argv = process.argv.slice(2)
const option = (flag: string): string | null => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null)
const dir = 'catalog/families/audit'
await mkdir(dir, { recursive: true })

async function senseWordings(): Promise<Map<string, { ru: string; en: string | null }>> {
  const map = new Map<string, { ru: string; en: string | null }>()
  for (const root of ['catalog/families/work', 'catalog/expansion/families/work']) {
    if (!existsSync(root)) continue
    for (const name of (await readdir(root)).filter((file) => /^batch-\d+\.json$/.test(file))) {
      for (const sense of JSON.parse(await readFile(join(root, name), 'utf8')) as { sense_id: string; ru: string; en: string | null }[]) map.set(sense.sense_id, { ru: sense.ru, en: sense.en })
    }
  }
  return map
}

if (argv.includes('--sample')) {
  const seed = Number(option('--seed') || 2609)
  const size = Number(option('--size') || 200)
  const paths = (option('--published') || ['catalog/families/published.jsonl', 'catalog/expansion/families/published.jsonl'].filter(existsSync).join(',')).split(',')
  const families: (PublishedFamily & { source: 'catalog' | 'expansion'; batch: string })[] = []
  for (const path of paths) {
    for (const line of (await readFile(path, 'utf8')).split(/\r?\n/u).filter(Boolean)) {
      families.push({ ...(JSON.parse(line) as PublishedFamily & { batch: string }), source: path.includes('expansion') ? 'expansion' : 'catalog' })
    }
  }
  // `--all` reads every sentence (a pilot); otherwise a stratified sample.
  const items = drawFamilyAudit(families, await senseWordings(), { seed, size, all: argv.includes('--all') })
  await writeFile(join(dir, `sample-${seed}.json`), `${JSON.stringify(items, null, 1)}\n`)
  const verdictsPath = join(dir, `verdicts-${seed}.json`)
  if (!existsSync(verdictsPath)) await writeFile(verdictsPath, `${JSON.stringify(items.map((item) => ({ id: item.id, failures: [] })), null, 1)}\n`)
  const md = [`# Sentence-family audit sample, seed ${seed}`, '', `${items.length} sentences from ${families.length} families. Record findings in \`verdicts-${seed}.json\` using:`, '',
    ...FAMILY_AUDIT_FAILURES.map((failure) => `- \`${failure}\`: ${FAMILY_AUDIT_LABELS[failure]}`), '',
    ...items.map((item, index) => [
      `## ${index + 1}. ${item.lemma} — ${item.sense.en ?? ''} / ${item.sense.ru}`,
      `\`${item.id}\` · ${item.level} · ${item.situation} · ${item.grammar} · ${item.source}${item.risk.length ? ` · ${item.risk.join(', ')}` : ''}`,
      '', `- da: ${item.variant.danish}  (target: **${item.variant.target}**)`, `- en: ${item.variant.en}`, `- ru: ${item.variant.ru}`,
      ...(item.variant.orders.length ? [`- other word orders: ${item.variant.orders.join(' · ')}`] : []),
      ...(item.variant.accepted?.length ? [`- gap also accepts: ${item.variant.accepted.join(' · ')}`] : []), '',
    ].join('\n'))].join('\n')
  await writeFile(join(dir, `sample-${seed}.md`), `${md}\n`)
  console.log(`Sampled ${items.length} sentences → ${dir}/sample-${seed}.md; verdicts in ${verdictsPath}`)
} else if (option('--tally')) {
  const seed = option('--tally')
  const items = JSON.parse(await readFile(join(dir, `sample-${seed}.json`), 'utf8')) as FamilyAuditItem[]
  const verdicts = JSON.parse(await readFile(join(dir, `verdicts-${seed}.json`), 'utf8')) as FamilyAuditVerdict[]
  const rows = tallyFamilyAudit(items, verdicts)
  const failing = failingStrata(rows)
  const pct = (value: number) => `${(value * 100).toFixed(1)}%`
  const table = ['| stratum | clean / reviewed | rate | ± 95% | severe |', '|---|---|---|---|---|',
    ...rows.map((row) => `| ${row.stratum} | ${row.clean}/${row.reviewed} | ${pct(row.rate)} | ${pct(row.margin)} | ${row.severe} |`)].join('\n')
  const counts = FAMILY_AUDIT_FAILURES.map((failure) => [failure, verdicts.filter((verdict) => verdict.failures.includes(failure)).length] as const).filter(([, n]) => n)
  const report = `# Sentence-family audit, seed ${seed}\n\n${table}\n\nFindings: ${counts.map(([failure, n]) => `${failure} ${n}`).join(', ') || 'none'}.\n\n${failing.length ? `**STOP**: ${failing.map((row) => row.stratum).join(', ')} below 95% (strata with at least 10 sentences).` : 'Every stratum with at least 10 sentences is at or above 95% clean.'}\n`
  await writeFile(join(dir, `tally-${seed}.md`), report)
  console.log(report)
  process.exitCode = failing.length ? 1 : 0
} else if (option('--approve')) {
  const seed = Number(option('--approve'))
  const items = JSON.parse(await readFile(join(dir, `sample-${seed}.json`), 'utf8')) as FamilyAuditItem[]
  const verdicts = JSON.parse(await readFile(join(dir, `verdicts-${seed}.json`), 'utf8')) as FamilyAuditVerdict[]
  if (verdicts.length !== items.length) throw new Error(`verdicts-${seed}.json judges ${verdicts.length} of ${items.length} sentences`)
  const failing = failingStrata(tallyFamilyAudit(items, verdicts))
  if (failing.length) {
    console.error(`Refusing: ${failing.map((row) => row.stratum).join(', ')} below 95%. Repair and redraw with a new seed.`)
    process.exit(1)
  }
  const replyPath = (item: FamilyAuditItem) => join(item.source === 'expansion' ? 'catalog/expansion/families' : 'catalog/families', 'out', item.batch)
  const paths = [...new Set(items.map(replyPath))].sort()
  const current = new Map<string, string>()
  const approvals: FamilyAuditApprovals = existsSync(join(dir, 'passed.json')) ? JSON.parse(await readFile(join(dir, 'passed.json'), 'utf8')) as FamilyAuditApprovals : {}
  const shas = new Map<string, string>()
  for (const path of paths) {
    const text = await readFile(path, 'utf8')
    shas.set(path, createHash('sha1').update(text).digest('hex'))
    for (const raw of JSON.parse(text) as FamilyReply[]) {
      if (!Array.isArray(raw?.variants)) continue
      try { for (const variant of publishFamily(raw).variants) current.set(variant.id, variant.version) } catch { /* malformed: the gate quarantines it */ }
    }
  }
  const open = unrepairedFindings(items, verdicts, current)
  if (open.length) {
    console.error(`Refusing: ${open.length} finding(s) still as judged:\n${open.map((item) => `  ${item.batch} ${item.lemma}: ${item.variant.danish}`).join('\n')}`)
    process.exit(1)
  }
  for (const path of paths) approvals[path] = { seed, sha1: shas.get(path) as string }
  const sorted = Object.fromEntries(Object.entries(approvals).sort(([a], [b]) => a.localeCompare(b)))
  await writeFile(join(dir, 'passed.json'), `${JSON.stringify(sorted, null, 1)}\n`)
  console.log(`Approved ${paths.length} batch replies under seed ${seed}.`)
} else {
  console.error('Usage: audit-families.ts --sample --seed N [--size 200] [--published a,b] [--all] | --tally N | --approve N')
  process.exit(1)
}
