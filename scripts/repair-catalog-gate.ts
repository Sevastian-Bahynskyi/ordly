import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CatalogGeneratedRow, CatalogGeneratedSense } from '../lib/catalog-contract'
import type { CatalogFailureCode } from '../lib/catalog-validation'

interface ReviewRow {
  batch: string
  lemma: string
  failures: Array<{ code: CatalogFailureCode; sense_ordinal?: number }>
}

const TEXT_REPLACEMENTS = new Map<string, string>([
  ['lægge:2', 'ложиться'],
  ['lade:2', 'притворяться'],
  ['lide:1', 'нравиться, любить'],
  ['mag:1', 'сила, усилие'],
])

const EXAMPLE_REPLACEMENTS = new Map<string, Pick<CatalogGeneratedSense, 'example' | 'example_translation'>>([
  ['kontrol:2', { example: 'Der var kontrol af passene i lufthavnen.', example_translation: 'В аэропорту была проверка паспортов.' }],
  ['station:1', { example: 'Toget ankommer til stationen klokken ti.', example_translation: 'Поезд прибывает на вокзал в десять часов.' }],
  ['plade:1', { example: 'Pladen på bordet er lavet af metal.', example_translation: 'Пластина на столе сделана из металла.' }],
  ['genre:1', { example: 'Denne genre er populær.', example_translation: 'Этот жанр популярен.' }],
])

async function main(): Promise<void> {
  const review = (await readFile('catalog/needs_review.jsonl', 'utf8'))
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ReviewRow)
  const byLemma = new Map(review.map((row) => [row.lemma, row]))
  const names = (await readdir('catalog/out')).filter((name) => /^batch-\d+\.json$/u.test(name)).sort()
  let repaired = 0

  for (const name of names) {
    const path = join('catalog/out', name)
    const rows = JSON.parse(await readFile(path, 'utf8')) as CatalogGeneratedRow[]
    let changed = false
    for (const row of rows) {
      const reviewRow = byLemma.get(row.lemma)
      if (!reviewRow) continue
      let rowChanged = false
      const invalidOrdinals = new Set(
        reviewRow.failures
          .filter((failure) => failure.code === 'sense_pos_changed')
          .map((failure) => failure.sense_ordinal)
          .filter((ordinal): ordinal is number => ordinal !== undefined),
      )
      if (invalidOrdinals.size) {
        const senses = row.senses.filter((sense) => !invalidOrdinals.has(sense.ordinal))
        if (!senses.length) throw new Error(`Removing unsupported senses would empty ${row.lemma}`)
        row.senses = senses.map((sense, index) => ({ ...sense, ordinal: index + 1 }))
        rowChanged = true
      }
      const unsupportedGenderOrdinals = new Set(
        reviewRow.failures
          .filter((failure) => failure.code === 'sense_gender_not_from_facts')
          .map((failure) => failure.sense_ordinal)
          .filter((ordinal): ordinal is number => ordinal !== undefined),
      )
      for (const sense of row.senses) {
        if (unsupportedGenderOrdinals.has(sense.ordinal) && sense.gender !== null) {
          sense.gender = null
          rowChanged = true
        }
      }
      for (const sense of row.senses) {
        const key = `${row.lemma}:${sense.ordinal}`
        const text = TEXT_REPLACEMENTS.get(key)
        if (text) {
          sense.text = text
          rowChanged = true
        }
        const example = EXAMPLE_REPLACEMENTS.get(key)
        if (example) {
          sense.example = example.example
          sense.example_translation = example.example_translation
          rowChanged = true
        }
      }
      if (rowChanged) {
        changed = true
        repaired += 1
      }
    }
    if (changed) await writeFile(path, `${JSON.stringify(rows, null, 2)}\n`, 'utf8')
  }
  console.log(`Repaired deterministic gate failures in ${repaired} catalog rows.`)
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Could not repair catalog gate failures')
  process.exitCode = 1
})
