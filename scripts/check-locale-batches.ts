/**
 * Hold every learner-language reply to its work file (issue #16).
 *
 *   pnpm exec tsx scripts/check-locale-batches.ts --lang en [--only batch-0007.json] [--merge]
 *     [--root catalog/expansion/locale --merged catalog/expansion/locale-en.json]
 *   pnpm exec tsx scripts/check-locale-batches.ts --lang uk --root catalog/locale-uk --merge
 *
 * A reply may only add wording. It must name exactly the senses its work file lists, keep their
 * ids, ordinals, part of speech and gender, and translate the Danish example it was given rather
 * than write a new one. Anything else is a failure of the whole batch: fixing a reply by hand is
 * how an unchecked row slips in. A batch with no reply yet is reported as pending, not failed, so
 * the pass can resume where it stopped.
 *
 * `--merge` writes every clean batch into one `catalog/locale-<lang>.json`, which is what
 * `scripts/import-catalog-locale.ts` loads.
 */
import { existsSync } from 'node:fs'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { validateLocaleFile, type LocaleFile, type LocaleSenseRow } from '../lib/catalog-locale'
import { checkLocaleReply, type LocaleWorkRow } from '../lib/catalog-locale-pass'
import { loadUkrainianCheckers } from '../lib/ukrainian-dictionaries'

const argv = process.argv.slice(2)
const lang = argv[argv.indexOf('--lang') + 1] || 'en'
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null
const merge = argv.includes('--merge')
const root = argv.includes('--root') ? argv[argv.indexOf('--root') + 1] : join('catalog', 'locale')
const mergedPath = argv.includes('--merged') ? argv[argv.indexOf('--merged') + 1] : join('catalog', `locale-${lang}.json`)

const spell = lang === 'uk' ? await loadUkrainianCheckers() : undefined
const workDir = join(root, 'work')
const replyDir = join(root, lang)
const names = (await readdir(workDir)).filter((name) => /^batch-\d+\.json$/.test(name) && (!only || name === only)).sort()

let clean = 0
let pending = 0
let failed = 0
const merged: LocaleSenseRow[] = []
const generators = new Set<string>()
for (const name of names) {
  const work = JSON.parse(await readFile(join(workDir, name), 'utf8')) as LocaleWorkRow[]
  const replyPath = join(replyDir, name)
  if (!existsSync(replyPath)) { pending += 1; continue }
  let reply: unknown
  try { reply = JSON.parse(await readFile(replyPath, 'utf8')) } catch { reply = null }
  const errors = [...validateLocaleFile(reply), ...(reply ? checkLocaleReply(work, reply as LocaleFile, lang, spell) : [])]
  // Rows the generator flagged (a reviewer rejection with no usable correction, no verdict at all)
  // pass the language check but were never vouched for, so the batch waits for a repair.
  const flagPath = replyPath.replace(/\.json$/u, '.flags.json')
  if (existsSync(flagPath)) for (const flag of JSON.parse(await readFile(flagPath, 'utf8')) as { lemma: string; field: string; note: string }[]) errors.push(`${flag.lemma}: ${flag.field} flagged (${flag.note})`)
  if (errors.length) {
    failed += 1
    console.log(`✗ ${name}: ${errors.length} problem(s)\n  ${errors.slice(0, 12).join('\n  ')}`)
    continue
  }
  clean += 1
  const file = reply as LocaleFile
  generators.add(file.generator)
  merged.push(...file.senses)
}
console.log(`${clean} clean · ${failed} failed · ${pending} pending (of ${names.length})`)

if (merge) {
  if (failed || pending) {
    console.error('Refusing to merge: every batch must be clean first.')
    process.exit(1)
  }
  const out: LocaleFile = { lang: lang as LocaleFile['lang'], generator: [...generators].sort().join(' + '), senses: merged }
  const target = mergedPath
  await writeFile(target, `${JSON.stringify(out, null, 1)}\n`)
  console.log(`Merged ${merged.length} senses into ${target}`)
}
process.exitCode = failed ? 1 : 0
