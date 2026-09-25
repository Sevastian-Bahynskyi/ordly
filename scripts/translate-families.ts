/**
 * Ukrainian translations for every published sentence-family variant (issue #24).
 *
 *   pnpm exec tsx --env-file=.env.corpus.local scripts/translate-families.ts [--limit 40]
 *
 * The published snapshot (`catalog/families/published.jsonl`) is rebuilt from audited replies by
 * `check-family-batches.ts --merge`, so the Ukrainian does not live in it: it is an overlay,
 * `catalog/families/translations-uk.json`, keyed by variant id and pinned to the variant's Danish.
 * `import-catalog-families.ts` adds it to each variant's `translations` only while that Danish is
 * unchanged, so an edited sentence never shows a stale translation.
 *
 * Sentences go through `scripts/ukrainian-sentences.ts` (Translator, round trip, DeepSeek review,
 * the Ukrainian check). A variant still failing is written with its problems into
 * `translations-uk.flags.json` and is not in the overlay until repaired. Resumable.
 */
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import type { PublishedFamily } from '../lib/catalog-families'
import { loadUkrainianCheckers } from '../lib/ukrainian-dictionaries'
import { spendLine } from './azure-corpus'
import { translateSentences, type SentenceItem } from './ukrainian-sentences'

export interface FamilyTranslation { danish: string; uk: string; via: string }

const argv = process.argv.slice(2)
const limit = Number(argv.includes('--limit') ? argv[argv.indexOf('--limit') + 1] : Infinity)
const overlayPath = 'catalog/families/translations-uk.json'
const flagsPath = 'catalog/families/translations-uk.flags.json'
const spell = await loadUkrainianCheckers()

const overlay: Record<string, FamilyTranslation> = existsSync(overlayPath) ? JSON.parse(await readFile(overlayPath, 'utf8')) : {}
const flags: Record<string, { danish: string; uk: string; problems: string[] }> = existsSync(flagsPath) ? JSON.parse(await readFile(flagsPath, 'utf8')) : {}
const families = (await readFile('catalog/families/published.jsonl', 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line) as PublishedFamily)

const todo: SentenceItem[] = []
for (const family of families) {
  for (const variant of family.variants) {
    if (overlay[variant.id]?.danish === variant.danish || flags[variant.id]?.danish === variant.danish) continue
    todo.push({ key: variant.id, danish: variant.danish, english: variant.en, russian: variant.ru })
  }
}
const items = todo.slice(0, limit)
console.log(`${items.length} of ${todo.length} variants to translate · ${spendLine()}`)

async function save(): Promise<void> {
  const sorted = <T>(record: Record<string, T>): Record<string, T> => Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)))
  await writeFile(overlayPath, `${JSON.stringify(sorted(overlay), null, 1)}\n`)
  if (Object.keys(flags).length) await writeFile(flagsPath, `${JSON.stringify(sorted(flags), null, 1)}\n`)
}

const CHUNK = 40
for (let start = 0; start < items.length; start += CHUNK) {
  const chunk = items.slice(start, start + CHUNK)
  const results = await translateSentences(`families ${start / CHUNK + 1}`, chunk, spell)
  for (const item of chunk) {
    const result = results.get(item.key)
    if (!result) continue
    if (result.problems.length) flags[item.key] = { danish: item.danish, uk: result.uk, problems: result.problems }
    else { overlay[item.key] = { danish: item.danish, uk: result.uk, via: result.via }; delete flags[item.key] }
  }
  await save()
  console.log(`  ${Math.min(start + CHUNK, items.length)}/${items.length} · ${Object.keys(flags).length} flagged · ${spendLine()}`)
}
console.log(`Overlay: ${Object.keys(overlay).length} variants · flagged: ${Object.keys(flags).length}`)
