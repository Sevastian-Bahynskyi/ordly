/**
 * Issue #6 step 0: measure before spending anything.
 *
 * Joins a Danish frequency ranking against the words actually in the vocabulary and prints the
 * hit rate at several depths. This is the gate that decides whether the catalog is worth
 * building, and how deep to build it — N is chosen from the curve, not guessed.
 *
 * The frequency list is licence-gated and is never downloaded automatically or committed. Accept
 * the terms at https://korpus.dsl.dk/resources/details/freq-lemmas.html, then:
 *
 *   pnpm exec tsx scripts/rank-coverage.ts --ranking ~/Downloads/lemmas.tsv
 *   pnpm exec tsx scripts/rank-coverage.ts --ranking lemmas.tsv --depths 3000,5000,10000,20000
 *
 * Multi-word entries are reported separately rather than counted as misses: a lemma list contains
 * no phrases by construction, so scoring `godt lide` against it would measure nothing.
 */
import { readFile } from 'node:fs/promises'
import { coverageAtDepths, parseRanking } from '../lib/catalog-ranking'
import { queryJson } from './catalog-db'

const DEFAULT_DEPTHS = [3000, 5000, 10000, 20000]

function valueAfter(argv: string[], flag: string): string | null {
  const at = argv.indexOf(flag)
  return at >= 0 && at + 1 < argv.length ? argv[at + 1] : null
}

function parseDepths(value: string | null): number[] {
  if (!value) return DEFAULT_DEPTHS
  const depths = value.split(',').map((part) => Number(part.trim()))
  if (!depths.length || depths.some((depth) => !Number.isInteger(depth) || depth < 1)) {
    throw new Error('--depths must be a comma-separated list of positive integers')
  }
  return depths.sort((left, right) => left - right)
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const rankingPath = valueAfter(argv, '--ranking')
  if (!rankingPath) throw new Error('Required: --ranking <frequency list>')
  const depths = parseDepths(valueAfter(argv, '--depths'))

  const ranking = parseRanking(await readFile(rankingPath, 'utf8'))
  if (!ranking.length) throw new Error('The ranking file produced no lemmas; check the format (pos\\tlemma\\tfrequency)')

  const entries = await queryJson<{ danish: string; entry_kind: string }>(
    "select danish, entry_kind from vocabulary_entries where entry_kind = 'word'",
  )
  const words = entries.map((entry) => entry.danish.trim()).filter((danish) => danish && !/\s/u.test(danish))
  const phrases = entries.length - words.length

  console.log(`Ranking: ${ranking.length.toLocaleString('en-US')} lemmas from ${rankingPath}`)
  console.log(`Vocabulary: ${entries.length} word entries — ${words.length} single words, ${phrases} multi-word`)
  console.log('')
  for (const { depth, covered, total, rate } of coverageAtDepths(ranking, words, depths)) {
    const percent = (rate * 100).toFixed(1).padStart(5)
    console.log(`  top ${String(depth).padStart(6)}  ${percent}%  (${covered}/${total})`)
  }
  console.log('')

  const deepest = coverageAtDepths(ranking, words, [depths[depths.length - 1]])[0]
  const missing = words.filter((word) => !ranking.some((entry) => entry.lemma === word.toLocaleLowerCase('da-DK')))
  if (missing.length) console.log(`Not in the ranking at any depth: ${missing.join(', ')}`)
  if (phrases) {
    console.log(`${phrases} multi-word entries are excluded by construction — a lemma list holds none (issue #6 §2).`)
  }
  if (deepest.rate < 0.6) {
    console.error('\nSTOP: below the 60% gate. The value proposition has changed; reconsider before building.')
    process.exitCode = 2
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Coverage measurement failed')
  process.exitCode = 1
})
