/**
 * How well the Ukrainian check tells the two languages apart on real catalog text (issue #24).
 *
 *   pnpm exec tsx scripts/measure-ukrainian-check.ts [--root catalog/locale-uk]
 *
 * Russian wordings and translations from the work files and the family snapshot are run through
 * the check as if they had been filed as Ukrainian: each one it passes is a Russian text the gate
 * would let through. When Ukrainian replies exist, they are measured too: each one it rejects is a
 * false alarm the pass had to repair.
 */
import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { LocaleFile } from '../lib/catalog-locale'
import type { LocaleWorkRow } from '../lib/catalog-locale-pass'
import type { PublishedFamily } from '../lib/catalog-families'
import { ukrainianProblems, ukrainianWordingProblems } from '../lib/ukrainian'
import { loadUkrainianCheckers } from '../lib/ukrainian-dictionaries'

const argv = process.argv.slice(2)
const root = argv.includes('--root') ? argv[argv.indexOf('--root') + 1] : join('catalog', 'locale-uk')
const spell = await loadUkrainianCheckers()

/** Each text with the part of speech of the sense it words, or null for a sentence. */
function measure(label: string, texts: readonly (string | [string, string | null])[], expectPass: boolean): void {
  const posOf = new Map<string, string | null>()
  for (const item of texts) if (Array.isArray(item)) posOf.set(item[0].trim(), item[1])
  const check = (text: string): string[] => posOf.has(text) ? ukrainianWordingProblems(text, posOf.get(text) ?? null, spell) : ukrainianProblems(text, spell)
  const unique = [...new Set(texts.map((item) => (Array.isArray(item) ? item[0] : item).trim()).filter(Boolean))]
  const wrong = unique.filter((text) => (check(text).length === 0) !== expectPass)
  const rate = unique.length ? (100 * (unique.length - wrong.length)) / unique.length : 0
  console.log(`${label}: ${unique.length - wrong.length}/${unique.length} ${expectPass ? 'accepted' : 'rejected'} (${rate.toFixed(1)}%)`)
  for (const text of wrong.slice(0, 15)) console.log(`   ${expectPass ? '✗ rejected' : '✗ let through'}: ${text}${expectPass ? ` — ${check(text).join('; ')}` : ''}`)
}

const work: LocaleWorkRow[] = []
for (const name of (await readdir(join(root, 'work'))).filter((file) => file.endsWith('.json')).sort()) {
  work.push(...JSON.parse(await readFile(join(root, 'work', name), 'utf8')) as LocaleWorkRow[])
}
const families = (await readFile('catalog/families/published.jsonl', 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line) as PublishedFamily)
measure('Russian sense wordings filed as Ukrainian', work.map((row): [string, string | null] => [row.ru, row.pos]), false)
measure('Russian example translations filed as Ukrainian', work.flatMap((row) => row.example_ru ? [row.example_ru] : []), false)
measure('Russian family translations filed as Ukrainian', families.flatMap((family) => family.variants.map((variant) => variant.ru)), false)

const replyDir = join(root, 'uk')
if (existsSync(replyDir)) {
  const replies: LocaleFile['senses'] = []
  for (const name of (await readdir(replyDir)).filter((file) => /^batch-\d+\.json$/.test(file))) replies.push(...(JSON.parse(await readFile(join(replyDir, name), 'utf8')) as LocaleFile).senses)
  measure('Ukrainian sense wordings', replies.map((row): [string, string | null] => [row.text, row.pos]), true)
  measure('Ukrainian example translations', replies.flatMap((row) => row.example_translation ? [row.example_translation] : []), true)
}
const overlay = 'catalog/families/translations-uk.json'
if (existsSync(overlay)) {
  const rows = Object.values(JSON.parse(await readFile(overlay, 'utf8')) as Record<string, { uk: string }>)
  measure('Ukrainian family translations', rows.map((row) => row.uk), true)
}
