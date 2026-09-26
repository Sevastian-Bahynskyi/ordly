/**
 * Seeded audit of the Ukrainian pass (issue #24): the Ukrainian language stratum.
 *
 *   pnpm exec tsx scripts/audit-locale.ts --draw --seed 2401 [--size 240]
 *   # a reader fills `failures` in catalog/locale-uk/audit/verdicts-2401.json
 *   pnpm exec tsx scripts/audit-locale.ts --tally 2401
 *
 * Reads the Ukrainian replies (`catalog/locale-uk/uk`), their work files (the Russian and English
 * each wording must match) and the family overlay (`catalog/families/translations-uk.json`).
 * Nothing here decides anything: it prepares what a person reads and adds up what they found.
 * `--tally` exits non-zero when a stratum is below 95% clean or any severe finding is left, and
 * then nothing may be loaded.
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { PublishedFamily } from '../lib/catalog-families'
import type { LocaleFile } from '../lib/catalog-locale'
import type { LocaleWorkRow } from '../lib/catalog-locale-pass'
import {
  drawLocaleAudit,
  LOCALE_AUDIT_FAILURES,
  LOCALE_AUDIT_LABELS,
  localeAuditBlocks,
  tallyLocaleAudit,
  unreadLocaleItems,
  type LocaleAuditItem,
  type LocaleAuditSense,
  type LocaleAuditVariant,
  type LocaleAuditVerdict,
} from '../lib/locale-audit'

const argv = process.argv.slice(2)
const option = (flag: string): string | null => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null)
const root = option('--root') || join('catalog', 'locale-uk')
const auditDir = join(root, 'audit')

async function loadPool(): Promise<{ senses: LocaleAuditSense[]; variants: LocaleAuditVariant[] }> {
  const senses: LocaleAuditSense[] = []
  for (const name of (await readdir(join(root, 'work'))).filter((file) => /^batch-\d+\.json$/.test(file)).sort()) {
    const replyPath = join(root, 'uk', name)
    if (!existsSync(replyPath)) continue
    const work = new Map((JSON.parse(await readFile(join(root, 'work', name), 'utf8')) as LocaleWorkRow[]).map((row) => [row.sense_id, row]))
    for (const row of (JSON.parse(await readFile(replyPath, 'utf8')) as LocaleFile).senses) {
      const source = work.get(row.sense_id)
      if (!source) continue
      senses.push({ ...row, source: { ru: source.ru, en: source.en ?? null, example_en: source.example_en ?? null } })
    }
  }
  const overlayPath = 'catalog/families/translations-uk.json'
  const overlay = existsSync(overlayPath) ? JSON.parse(await readFile(overlayPath, 'utf8')) as Record<string, { danish: string; uk: string }> : {}
  const variants: LocaleAuditVariant[] = []
  for (const line of (await readFile('catalog/families/published.jsonl', 'utf8')).split('\n').filter(Boolean)) {
    const family = JSON.parse(line) as PublishedFamily
    for (const variant of family.variants) {
      const uk = overlay[variant.id]
      if (uk && uk.danish === variant.danish) variants.push({ id: variant.id, level: family.level, lemma: family.lemma, danish: variant.danish, en: variant.en, ru: variant.ru, uk: uk.uk })
    }
  }
  return { senses, variants }
}

function render(items: readonly LocaleAuditItem[], seed: number): string {
  const lines = [`# Ukrainian audit, seed ${seed}`, '', `${items.length} items. Failure classes:`, '']
  for (const failure of LOCALE_AUDIT_FAILURES) lines.push(`- \`${failure}\`: ${LOCALE_AUDIT_LABELS[failure]}`)
  lines.push('')
  for (const [index, item] of items.entries()) {
    lines.push(`## ${index + 1}. ${item.type} · ${item.lemma} · \`${item.id}\``, '')
    if (item.danish) lines.push(`- da: ${item.danish}`)
    if (item.russian) lines.push(`- ru: ${item.russian}`)
    if (item.english) lines.push(`- en: ${item.english}`)
    lines.push(`- **uk: ${item.ukrainian}**`, '')
  }
  return `${lines.join('\n')}\n`
}

const seed = Number(option('--seed') || option('--tally'))
if (!Number.isInteger(seed)) {
  console.error('Usage: audit-locale.ts --draw --seed N [--size 240] | --tally N')
  process.exit(1)
}
await mkdir(auditDir, { recursive: true })
const samplePath = join(auditDir, `sample-${seed}.json`)
const verdictPath = join(auditDir, `verdicts-${seed}.json`)

if (argv.includes('--draw')) {
  const { senses, variants } = await loadPool()
  const items = drawLocaleAudit(senses, variants, { seed, size: Number(option('--size') || 240) })
  await writeFile(samplePath, `${JSON.stringify(items, null, 1)}\n`)
  await writeFile(join(auditDir, `sample-${seed}.md`), render(items, seed))
  if (!existsSync(verdictPath)) await writeFile(verdictPath, `${JSON.stringify(items.map((item): LocaleAuditVerdict => ({ id: item.id, failures: null })), null, 1)}\n`)
  console.log(`Drew ${items.length} of ${senses.length} wordings, ${senses.filter((sense) => sense.example_translation).length} examples and ${variants.length} family sentences → ${join(auditDir, `sample-${seed}.md`)}`)
} else {
  const items = JSON.parse(await readFile(samplePath, 'utf8')) as LocaleAuditItem[]
  const verdicts = JSON.parse(await readFile(verdictPath, 'utf8')) as LocaleAuditVerdict[]
  const rows = tallyLocaleAudit(items, verdicts)
  const table = ['| stratum | reviewed | clean | rate | ±95% | severe |', '|---|---|---|---|---|---|',
    ...rows.map((row) => `| ${row.stratum} | ${row.reviewed} | ${row.clean} | ${(100 * row.rate).toFixed(1)}% | ${(100 * row.margin).toFixed(1)} | ${row.severe} |`)]
  const findings = verdicts.filter((verdict) => verdict.failures?.length).map((verdict) => `- \`${verdict.id}\`: ${(verdict.failures || []).join(', ')}${verdict.note ? ` — ${verdict.note}` : ''}`)
  const unread = unreadLocaleItems(items, verdicts)
  if (unread.length) {
    console.error(`${unread.length} of ${items.length} sampled items have no verdict yet (failures: null). Read them first.`)
    process.exit(1)
  }
  const blocks = localeAuditBlocks(rows)
  const report = [`# Ukrainian audit report, seed ${seed}`, '', ...table, '', '## Findings', '', ...(findings.length ? findings : ['None.']), '',
    blocks.length ? `**STOP**: ${blocks.map((row) => row.stratum).join(', ')}` : '**PASS**: every stratum at or above 95% clean, no severe finding.'].join('\n')
  await writeFile(join(auditDir, `report-${seed}.md`), `${report}\n`)
  console.log(report)
  process.exitCode = blocks.length ? 1 : 0
}
