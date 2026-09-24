/**
 * The published coverage report (issue #16; spec #12 decision 15).
 *
 *   pnpm exec tsx scripts/coverage-report.ts --freq <freq-30k-ex.txt> --fullforms <ddo-fullforms.csv> \
 *     [--out catalog/out,catalog/expansion/out] [--locale catalog/locale-en.json,catalog/locale-pilot.en.json] \
 *     [--report docs/content-coverage-report.md]
 *
 * Reads only committed content and the two DSL source files. Writes the Markdown report; the
 * numbers in it are recomputed from scratch every run, so a stale report is one command away
 * from a fresh one.
 */
import { existsSync } from 'node:fs'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseCatalogGeneratorText } from '../lib/catalog-contract'
import { isGeneratedCatalogRow } from '../lib/catalog-validation'
import { DSL_CLASSES, matrixCoverage, parseFrequencyList, supportKey, textCoverage, weightedCoverage, type WeightedCoverage } from '../lib/content-coverage'

const argv = process.argv.slice(2)
const option = (flag: string): string | null => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null)
const freqPath = option('--freq')
const fullFormsPath = option('--fullforms')
if (!freqPath || !fullFormsPath) {
  console.error('Usage: coverage-report.ts --freq <freq-30k-ex.txt> --fullforms <ddo-fullforms.csv> [--out dirs] [--locale files] [--report file]')
  process.exit(1)
}
const outDirs = (option('--out') || ['catalog/out', 'catalog/expansion/out'].filter(existsSync).join(',')).split(',')
const localeFiles = (option('--locale') || ['catalog/locale-en.json', 'catalog/locale-pilot.en.json', 'catalog/expansion/locale-en.json'].filter(existsSync).join(',')).split(',')
const reportPath = option('--report') || 'docs/content-coverage-report.md'

// What the catalog supports, per learner language: `lemma|pos` with a worded sense.
const ru = new Set<string>()
const en = new Set<string>()
const lemmas = new Set<string>()
let entries = 0
let senses = 0
for (const dir of outDirs) {
  for (const name of (await readdir(dir)).filter((file) => /^batch-\d+\.json$/.test(file))) {
    for (const value of parseCatalogGeneratorText(await readFile(join(dir, name), 'utf8'))) {
      if (!isGeneratedCatalogRow(value)) continue
      entries += 1
      lemmas.add(value.lemma.toLocaleLowerCase('da-DK'))
      for (const sense of value.senses) { senses += 1; if (sense.pos) ru.add(supportKey(value.lemma, sense.pos)) }
    }
  }
}
let englishSenses = 0
for (const path of localeFiles) {
  const file = JSON.parse(await readFile(path, 'utf8')) as { senses: { lemma: string; pos: string | null }[] }
  for (const sense of file.senses) { englishSenses += 1; if (sense.pos) en.add(supportKey(sense.lemma, sense.pos)) }
}
const both = new Set([...ru].filter((key) => en.has(key)))

const { rows, excluded } = parseFrequencyList(await readFile(freqPath, 'utf8'))
const lexical = { ru: weightedCoverage(rows, ru), en: weightedCoverage(rows, en), both: weightedCoverage(rows, both) }
// The string-only figure, for comparison with the baseline measured before this pass.
const byString = weightedCoverage(rows, new Set(rows.filter((row) => lemmas.has(row.lemma.toLocaleLowerCase('da-DK'))).map((row) => supportKey(row.lemma, DSL_CLASSES[row.cls]))))

// Unseen sentences: forms resolved through the DDO full-form list.
const lemmasByForm = new Map<string, string[]>()
for (const line of (await readFile(fullFormsPath, 'utf8')).split(/\r?\n/u)) {
  const [form, lemma] = line.split('\t')
  if (!form || !lemma) continue
  const key = form.toLocaleLowerCase('da-DK')
  const list = lemmasByForm.get(key) || []
  const lower = lemma.toLocaleLowerCase('da-DK')
  if (!list.includes(lower)) list.push(lower)
  lemmasByForm.set(key, list)
}
const unseen = (await readFile('catalog/benchmark/unseen-tatoeba.tsv', 'utf8')).split(/\r?\n/u).filter((line) => line && !line.startsWith('#')).map((line) => line.split('\t')[1])
const text = textCoverage(unseen, (form) => lemmasByForm.get(form), lemmas)

// Learning coverage from the published families.
const matrix = JSON.parse(await readFile('catalog/benchmark/cefr-matrix.json', 'utf8')) as { version: string; situations: { id: string; levels: string[]; label: string }[]; grammar: { id: string; levels: string[]; label: string }[] }
const publishedPath = 'catalog/families/published.jsonl'
const families = existsSync(publishedPath)
  ? (await readFile(publishedPath, 'utf8')).split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line) as { level: string; situation: string; grammar: string; lemma: string; sense_id: string; variants: unknown[] })
  : []
const cells = matrixCoverage(matrix, families)
const CELL_MIN = 3
const coveredCells = cells.filter((cell) => cell.families >= CELL_MIN)
const variants = families.reduce((sum, family) => sum + family.variants.length, 0)
const byLevel = ['A1', 'A2', 'B1', 'B2'].map((level) => ({ level, families: families.filter((family) => family.level === level).length }))

const pct = (value: number) => `${(value * 100).toFixed(1)}%`
const bandRows = (result: WeightedCoverage) => result.bands.map((band) => `| ${band.from.toLocaleString('en-US')}–${band.to.toLocaleString('en-US')} | ${band.covered}/${band.lemmas} | ${pct(band.coverage)} |`).join('\n')

const report = `# Content coverage report

Generated by \`scripts/coverage-report.ts\` on ${new Date().toISOString().slice(0, 10)}. Issue #16, spec #12 decision 15.
Three separate measures. **None of them measures a learner's proficiency**, and none of them is
added to another.

## Catalog size

- ${entries.toLocaleString('en-US')} headwords, ${senses.toLocaleString('en-US')} senses with Russian wording, ${englishSenses.toLocaleString('en-US')} with English wording.
- ${families.length.toLocaleString('en-US')} published sentence families, ${variants.toLocaleString('en-US')} distinct checked sentences, each with an English and a Russian translation.
  Each sentence can be offered as a typed gap and as a word-order task, so at most
  ${(variants * 2).toLocaleString('en-US')} distinct catalog exercises exist. That is the real count after constraints and
  de-duplication; no combination is generated at runtime.

## 1. Weighted lemma coverage within DSL \`freq-30k-ex\`

Denominator: the summed frequency of the ${rows.length.toLocaleString('en-US')} lemmas in the list's classes
${Object.keys(DSL_CLASSES).join(', ')}. Excluded classes (not headwords the catalog can hold):
${Object.entries(excluded).map(([cls, n]) => `${cls} (${n})`).join(', ')}.
A lemma counts when the catalog has a sense for it **in the word class the list gives** and that
sense is worded in the learner language.

| learner language | weighted coverage | lemmas covered | open classes (NC V A D) | closed classes |
|---|---|---|---|---|
| Russian | ${pct(lexical.ru.overall)} | ${lexical.ru.covered.toLocaleString('en-US')} | ${pct(lexical.ru.open)} | ${pct(lexical.ru.closed)} |
| English | ${pct(lexical.en.overall)} | ${lexical.en.covered.toLocaleString('en-US')} | ${pct(lexical.en.open)} | ${pct(lexical.en.closed)} |
| both | ${pct(lexical.both.overall)} | ${lexical.both.covered.toLocaleString('en-US')} | ${pct(lexical.both.open)} | ${pct(lexical.both.closed)} |

Lemma-string match without the class check (the baseline's method): ${pct(byString.overall)}.

By frequency band (both languages):

| rank band | lemmas covered | weighted coverage |
|---|---|---|
${bandRows(lexical.both)}

This is coverage **of the list**, which aggregates inflected forms over DSL's corpus; it is not
the share of all Danish text a learner will understand. The approximately 90% target is read
against the "both" row.

## 2. Independent unseen sentence set

${text.sentences.toLocaleString('en-US')} Tatoeba sentences (CC BY 2.0 FR), frozen in \`catalog/benchmark/unseen-tatoeba.tsv\`
before any sentence family was written; the family gate refuses any sentence copied from it.

| measure | value |
|---|---|
| token coverage | ${pct(text.tokenCoverage)} of ${text.tokens.toLocaleString('en-US')} tokens |
| lemma coverage | ${pct(text.lemmaCoverage)} of ${text.lemmas.toLocaleString('en-US')} distinct lemmas |
| sentences fully covered | ${pct(text.sentenceCoverage)} |
| tokens no form list knows (names, foreign words), excluded | ${text.unknownTokens.toLocaleString('en-US')} |
| phrase coverage | not measured: the catalog has no multi-word entries yet and there is no independent phrase inventory to count against |

Limitation: a token is resolved to lemmas through the DDO full-form list, which cannot say which
reading a homograph is; a token counts as covered when any of its readings is a catalog lemma, so
the lemma figure is an upper bound.

## 3. A1–B2 learning coverage

Matrix \`${matrix.version}\` (\`catalog/benchmark/cefr-matrix.json\`): ${matrix.situations.length} situations and ${matrix.grammar.length} grammar
functions, each at the levels it is taught, aligned to the CEFR companion volume. A cell is
covered with at least ${CELL_MIN} gated families (each usable in English and Russian).

**${coveredCells.length} of ${cells.length} cells covered.** Families by level: ${byLevel.map((row) => `${row.level} ${row.families.toLocaleString('en-US')}`).join(' · ')}.

| axis | cell | level | families | sentences |
|---|---|---|---|---|
${cells.map((cell) => `| ${cell.axis} | ${cell.id} | ${cell.level} | ${cell.families} | ${cell.sentences} |`).join('\n')}

Cells below the threshold: ${cells.filter((cell) => cell.families < CELL_MIN).map((cell) => `${cell.id} ${cell.level}`).join(', ') || 'none'}.
`
await writeFile(reportPath, report)
console.log(`lexical both ${pct(lexical.both.overall)} · ru ${pct(lexical.ru.overall)} · en ${pct(lexical.en.overall)} · string ${pct(byString.overall)}`)
console.log(`unseen tokens ${pct(text.tokenCoverage)} · lemmas ${pct(text.lemmaCoverage)} · sentences ${pct(text.sentenceCoverage)}`)
console.log(`matrix ${coveredCells.length}/${cells.length} cells · ${families.length} families · ${variants} sentences → ${reportPath}`)

