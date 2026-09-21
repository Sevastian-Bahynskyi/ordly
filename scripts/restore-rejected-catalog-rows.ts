import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CatalogGeneratedRow } from '../lib/catalog-contract'

const run = promisify(execFile)

interface ReviewRow {
  lemma: string
}

function valueAfter(argv: string[], flag: string): string | null {
  const at = argv.indexOf(flag)
  return at >= 0 && at + 1 < argv.length ? argv[at + 1] : null
}

async function main(): Promise<void> {
  const base = valueAfter(process.argv.slice(2), '--base')
  if (!base) throw new Error('Required: --base <validated git revision>')
  const rejected = new Set(
    (await readFile('catalog/needs_review.jsonl', 'utf8'))
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((line) => (JSON.parse(line) as ReviewRow).lemma),
  )
  const names = (await readdir('catalog/out')).filter((name) => /^batch-\d+\.json$/u.test(name)).sort()
  let restored = 0

  for (const name of names) {
    const path = join('catalog/out', name)
    const current = JSON.parse(await readFile(path, 'utf8')) as CatalogGeneratedRow[]
    const { stdout } = await run('git', ['show', `${base}:${path}`], { maxBuffer: 16 * 1024 * 1024 })
    const baseline = new Map((JSON.parse(stdout) as CatalogGeneratedRow[]).map((row) => [row.lemma, row]))
    let changed = false
    const rows = current.map((row) => {
      if (!rejected.has(row.lemma)) return row
      const previous = baseline.get(row.lemma)
      if (!previous) throw new Error(`No baseline row for ${row.lemma}`)
      restored += 1
      changed = true
      return { ...row, senses: previous.senses }
    })
    if (changed) await writeFile(path, `${JSON.stringify(rows, null, 2)}\n`, 'utf8')
  }
  console.log(`Restored ${restored} rejected rows to their pre-pass meanings.`)
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Could not restore rejected catalog rows')
  process.exitCode = 1
})
