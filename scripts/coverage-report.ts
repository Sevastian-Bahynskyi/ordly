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
import { countPhraseOccurrences, type PhraseCandidate, type PhraseLabel } from '../lib/catalog-phrases'
import { isGeneratedCatalogRow } from '../lib/catalog-validation'
import { corPartsOfSpeech } from '../lib/cor'
import { parseCorTsv, type CorRow } from '../lib/cor-tsv'
import type { PartOfSpeech } from '../lib/types'
import { DSL_CLASSES, matrixCoverage, parseFrequencyList, supportKey, textCoverage, weightedCoverage, type WeightedCoverage } from '../lib/content-coverage'

const argv = process.argv.slice(2)
const option = (flag: string): string | null => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null)
const freqPath = option('--freq')
const corPath = option('--cor') || process.env.CATALOG_COR_TSV || null
const fullFormsPath = option('--fullforms')
if (!freqPath || !fullFormsPath) {
  console.error('Usage: coverage-report.ts --freq <freq-30k-ex.txt> --fullforms <ddo-fullforms.csv> [--out dirs] [--locale files] [--report file]')
  process.exit(1)
}
const outDirs = (option('--out') || ['catalog/out', 'catalog/expansion/out', 'catalog/expansion2/out', 'catalog/phrases/out'].filter(existsSync).join(',')).split(',')
const localeFiles = (option('--locale') || ['catalog/locale-en.json', 'catalog/locale-pilot.en.json', 'catalog/expansion/locale-en.json', 'catalog/expansion2/locale-en.json', 'catalog/phrases/locale-en.json'].filter(existsSync).join(',')).split(',')
const reportPath = option('--report') || 'docs/content-coverage-report.md'

// What the catalog supports, per learner language: `lemma|pos` with a worded sense.
const ru = new Set<string>()
const en = new Set<string>()
const lemmas = new Set<string>()
const phrases = new Set<string>()
let entries = 0
let senses = 0
for (const dir of outDirs) {
  // Rows the catalog gate quarantined are not in the catalog, so they cover nothing.
  const reviewPath = join(dir, '..', 'needs_review.jsonl')
  const quarantined = new Set(existsSync(reviewPath) ? (await readFile(reviewPath, 'utf8')).split(/\r?\n/u).filter(Boolean).map((line) => String((JSON.parse(line) as { lemma?: unknown }).lemma)) : [])
  for (const name of (await readdir(dir)).filter((file) => /^batch-\d+\.json$/.test(file))) {
    for (const value of parseCatalogGeneratorText(await readFile(join(dir, name), 'utf8'))) {
      if (!isGeneratedCatalogRow(value) || quarantined.has(value.lemma)) continue
      entries += 1
      if (value.kind === 'phrase') phrases.add(value.lemma.toLocaleLowerCase('da-DK'))
      else lemmas.add(value.lemma.toLocaleLowerCase('da-DK'))
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
// The register's headword for a list lemma that is only a form in that class (`det` → `den`).
// A list lemma COR also knows as a headword in that class is never re-read as a form of another
// word: `have` the noun is "garden", not the plural of `hav`.
const corByForm = new Map<string, CorRow[]>()
if (corPath) for (const row of parseCorTsv(await readFile(corPath, 'utf8'))) corByForm.set(row.form, [...(corByForm.get(row.form) || []), row])
const headwordOf = (lemma: string, pos: string): string | null => {
  const rowsForForm = (corByForm.get(lemma.toLocaleLowerCase('da-DK')) || []).filter((row) => corPartsOfSpeech(row.tag).includes(pos as PartOfSpeech))
  if (!rowsForForm.length || rowsForForm.some((row) => row.lemma === lemma.toLocaleLowerCase('da-DK'))) return null
  return rowsForForm[0].lemma
}
const lexical = { ru: weightedCoverage(rows, ru, headwordOf), en: weightedCoverage(rows, en, headwordOf), both: weightedCoverage(rows, both, headwordOf) }
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

// Phrase coverage: occurrences, in the same unseen sentences, of the rights-cleared inventory's
// phrases that were labelled learnable A1–B2 units (catalog/phrases). The inventory's attestation
// counts excluded these sentences, and the labels were made without reading them.
const phraseInventoryPath = 'catalog/phrases/inventory.jsonl'
const phraseLabelsPath = 'catalog/phrases/classified.json'
const phraseMeasure = existsSync(phraseInventoryPath) && existsSync(phraseLabelsPath) ? await (async () => {
  const labels = (JSON.parse(await readFile(phraseLabelsPath, 'utf8')) as { labels: (PhraseLabel & { phrase: string })[] }).labels
  const units = new Set(labels.filter((label) => label.unit && label.type !== 'free' && label.level !== 'C1').map((label) => label.phrase))
  const inventory = (await readFile(phraseInventoryPath, 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line) as PhraseCandidate).filter((candidate) => units.has(candidate.phrase))
  let occurrences = 0
  let covered = 0
  const seen = new Set<string>()
  const seenCovered = new Set<string>()
  for (const sentence of unseen) for (const candidate of inventory) {
    const hits = countPhraseOccurrences(sentence, candidate.forms)
    if (!hits) continue
    occurrences += hits
    seen.add(candidate.phrase)
    if (phrases.has(candidate.phrase)) { covered += hits; seenCovered.add(candidate.phrase) }
  }
  return { units: units.size, labelled: labels.length, occurrences, covered, seen: seen.size, seenCovered: seenCovered.size }
})() : null

// Learning coverage from the published families.
const matrix = JSON.parse(await readFile('catalog/benchmark/cefr-matrix.json', 'utf8')) as { version: string; situations: { id: string; levels: string[]; label: string }[]; grammar: { id: string; levels: string[]; label: string }[] }
type Published = { level: string; situation: string; grammar: string; lemma: string; sense_id: string; variants: unknown[] }
const families: Published[] = []
for (const publishedPath of ['catalog/families/published.jsonl', 'catalog/expansion/families/published.jsonl'].filter(existsSync)) {
  families.push(...(await readFile(publishedPath, 'utf8')).split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line) as Published))
}
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

- ${entries.toLocaleString('en-US')} headwords (${phrases.size.toLocaleString('en-US')} of them multi-word phrases), ${senses.toLocaleString('en-US')} senses with Russian wording, ${englishSenses.toLocaleString('en-US')} with English wording.
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

| learner language | weighted coverage | of which via headword | lemmas covered | open classes (NC V A D) | closed classes |
|---|---|---|---|---|---|
| Russian | ${pct(lexical.ru.overall)} | ${pct(lexical.ru.viaHeadword)} | ${lexical.ru.covered.toLocaleString('en-US')} | ${pct(lexical.ru.open)} | ${pct(lexical.ru.closed)} |
| English | ${pct(lexical.en.overall)} | ${pct(lexical.en.viaHeadword)} | ${lexical.en.covered.toLocaleString('en-US')} | ${pct(lexical.en.open)} | ${pct(lexical.en.closed)} |
| both | ${pct(lexical.both.overall)} | ${pct(lexical.both.viaHeadword)} | ${lexical.both.covered.toLocaleString('en-US')} | ${pct(lexical.both.open)} | ${pct(lexical.both.closed)} |

"Via headword": the list names a word COR files as a form of another headword in the same class
(\`det\` → \`den\`, \`far\` → \`fader\`, \`mens\` → \`medens\`); the catalog saves words under COR's
headword, so it teaches them there. ${corPath ? '' : '**COR was not supplied to this run, so nothing was credited this way.**'}
Direct coverage alone is the overall figure minus that column.

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
| phrase coverage | ${phraseMeasure ? `${phraseMeasure.occurrences ? pct(phraseMeasure.covered / phraseMeasure.occurrences) : 'n/a'} of ${phraseMeasure.occurrences} occurrences of ${phraseMeasure.seen} distinct inventory phrases (${phraseMeasure.seenCovered} of them in the catalog)` : 'not measured: no phrase inventory'} |

Limitation: a token is resolved to lemmas through the DDO full-form list, which cannot say which
reading a homograph is; a token counts as covered when any of its readings is a catalog lemma, so
the lemma figure is an upper bound.

Phrase coverage counts contiguous occurrences of phrases from the rights-cleared phrase inventory
(\`catalog/phrases/inventory.jsonl\`: Danish FrameNet 1.0, Wikidata Lexemes, DDO full-form multi-word
headwords) that were labelled learnable A1–B2 units${phraseMeasure ? ` (${phraseMeasure.units} of the ${phraseMeasure.labelled} most attested)` : ''}. The catalog has
${phrases.size} phrase entries. A split particle verb (\`står han op\`) is not counted, and the
inventory's recall is that of its sources, so the denominator is a floor, not every multi-word unit
in the sentences.

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
console.log(`lexical both ${pct(lexical.both.overall)} (via headword ${pct(lexical.both.viaHeadword)}) · ru ${pct(lexical.ru.overall)} · en ${pct(lexical.en.overall)} · string ${pct(byString.overall)}`)
console.log(`unseen tokens ${pct(text.tokenCoverage)} · lemmas ${pct(text.lemmaCoverage)} · sentences ${pct(text.sentenceCoverage)}`)
console.log(`matrix ${coveredCells.length}/${cells.length} cells · ${families.length} families · ${variants} sentences → ${reportPath}`)

