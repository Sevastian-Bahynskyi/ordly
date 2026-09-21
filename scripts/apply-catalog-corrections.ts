import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CatalogGeneratedSense } from '../lib/catalog-contract'

interface Correction {
  lemma: string
  senses: CatalogGeneratedSense[]
  pronunciation?: string | null
}

async function main(): Promise<void> {
  const corrections = JSON.parse(await readFile('catalog/audit-corrections.json', 'utf8')) as Correction[]
  const byLemma = new Map(corrections.map((correction) => [correction.lemma, correction]))
  const applied = new Set<string>()
  const names = (await readdir('catalog/out')).filter((name) => /^batch-\d+\.json$/u.test(name)).sort()

  for (const name of names) {
    const path = join('catalog/out', name)
    const rows = JSON.parse(await readFile(path, 'utf8')) as Array<Record<string, unknown>>
    let changed = false
    for (const row of rows) {
      const lemma = typeof row.lemma === 'string' ? row.lemma : ''
      const correction = byLemma.get(lemma)
      if (!correction) continue
      row.senses = correction.senses
      if ('pronunciation' in correction) row.pronunciation = correction.pronunciation ?? null
      applied.add(lemma)
      changed = true
    }
    if (changed) await writeFile(path, `${JSON.stringify(rows, null, 2)}\n`, 'utf8')
  }

  const missing = [...byLemma.keys()].filter((lemma) => !applied.has(lemma))
  if (missing.length) throw new Error(`Corrections did not match catalog rows: ${missing.join(', ')}`)
  console.log(`Applied ${applied.size} audited catalog corrections.`)
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Could not apply catalog corrections')
  process.exitCode = 1
})
