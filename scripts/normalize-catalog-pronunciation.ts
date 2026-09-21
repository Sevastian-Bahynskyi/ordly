import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CatalogGeneratedRow } from '../lib/catalog-contract'

const ASCII_STRESS = /([аеёиоуыэюя])'/giu

async function main(): Promise<void> {
  const names = (await readdir('catalog/out')).filter((name) => /^batch-\d+\.json$/u.test(name)).sort()
  let normalized = 0

  for (const name of names) {
    const path = join('catalog/out', name)
    const rows = JSON.parse(await readFile(path, 'utf8')) as CatalogGeneratedRow[]
    let changed = false
    for (const row of rows) {
      if (!row.pronunciation?.includes("'")) continue
      const pronunciation = row.pronunciation.replace(ASCII_STRESS, '$1\u0301')
      if (pronunciation.includes("'")) {
        throw new Error(`Could not normalize the ASCII stress marker for ${row.lemma}`)
      }
      row.pronunciation = pronunciation
      normalized += 1
      changed = true
    }
    if (changed) await writeFile(path, `${JSON.stringify(rows, null, 2)}\n`, 'utf8')
  }

  console.log(`Normalized ${normalized} catalog pronunciation hints.`)
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Could not normalize catalog pronunciation hints')
  process.exitCode = 1
})
