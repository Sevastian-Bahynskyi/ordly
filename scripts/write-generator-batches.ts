/**
 * Issue #6 step 3: turn `facts.jsonl` into paste-ready prompt files.
 *
 * The generator is a swappable part, and a browser chat is one of the supported ones. This writes
 * one file per batch containing the exact prompt from `lib/catalog-contract.ts` — the same
 * contract an API generator would receive, with that batch's facts already embedded — plus an
 * index the validator reads so each reply is checked against the right slice.
 *
 *   pnpm exec tsx scripts/write-generator-batches.ts --facts catalog/facts.jsonl --size 50
 *
 * Nothing here generates anything. It prepares the asking.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { buildCatalogGeneratorPrompt, parseCatalogFact, type CatalogFact } from '../lib/catalog-contract'

/**
 * Words per batch.
 *
 * Larger than the API default of 40, because every batch here costs a human a copy and a paste,
 * and fewer round trips is the whole point. Not much larger: a reply grows with the batch, and a
 * long reply is where a model starts shortening fields and dropping rows.
 */
const BROWSER_BATCH_SIZE = 50

function valueAfter(argv: string[], flag: string): string | null {
  const at = argv.indexOf(flag)
  return at >= 0 && at + 1 < argv.length ? argv[at + 1] : null
}

async function readFacts(path: string): Promise<CatalogFact[]> {
  const text = await readFile(path, 'utf8')
  return text.split(/\r?\n/u).filter((line) => line.trim()).map((line, index) => {
    const fact = parseCatalogFact(JSON.parse(line) as unknown)
    if (!fact) throw new Error(`facts.jsonl line ${index + 1} does not match the fact contract`)
    return fact
  })
}

/**
 * The phrase list is asked for separately, and first among equals.
 *
 * A lemma frequency list contains no multi-word entries at all — 0 of 9 real ones matched COR —
 * yet 12% of the vocabulary actually added is phrases. They cannot be ranked from a corpus we
 * have, so the list itself is a judgement, and it is the only list here a model is asked to
 * invent rather than to enrich.
 */
const PHRASE_LIST_PROMPT = `You are building a list of Danish multi-word expressions for a learner's vocabulary app.

Return a bare JSON array of strings and nothing else: no Markdown, no code fences, no explanation.

Include, in roughly this order of usefulness to an intermediate learner:
1. Particle and separable verbs whose meaning is not the sum of their parts — tage på, slå op, finde ud af, holde op, give op, komme i gang.
2. Fixed expressions — godt lide, synes om, have lyst til, være ved at.
3. Common prepositional and adverbial phrases — uden for byen, om eftermiddagen, i går, på den anden side.

Rules:
- Every entry is Danish, lowercase, and contains at least one space.
- Dictionary form: the infinitive for verbs (tage på, not tager på).
- No full sentences, no proverbs, no rare or literary expressions.
- No duplicates, and no entry that is really one word.
- Aim for 1500 entries. Fewer good ones is better than padding.

Save the array as catalog/phrases.json.`

function readme(batches: number, size: number, total: number): string {
  return `# How to generate the catalog

${batches} files, ${size} words each, ${total} words total. Frequency order, so stopping partway
still leaves the most useful words done.

## For each batch

1. Open a **new chat**. Not a new message in an old one — a long conversation drifts, and around
   the thirtieth batch a model starts shortening fields and dropping rows.
2. Paste the whole contents of \`batch-NNNN.txt\`.
3. Save the reply — the bare JSON array, nothing else — as \`catalog/out/batch-NNNN.json\`.

The reply must be a JSON array with exactly ${size} objects in exactly the order it was asked for.
If it arrives wrapped in a code fence, strip the fence. If the model says anything before or after
the array, delete it.

## The phrase list

\`phrases.txt\` is a different job and a later one: it asks for the multi-word expressions a
frequency list cannot contain. Do the words first.

## Then check it

\`\`\`
pnpm exec tsx scripts/validate-catalog.ts \\
  --facts catalog/facts.jsonl \\
  --input catalog/out/batch-0001.json \\
  --sources scripts/catalog-validation-sources.ts \\
  --start 0 --size ${size}
\`\`\`

\`--start\` is in \`index.json\` next to this file, one entry per batch. Below 95% clean the script
exits non-zero: regenerate that batch rather than fixing rows by hand, so provenance stays honest.

## What the gate will reject

- a pronunciation containing any Latin letter, or one supplied for a word whose IPA is \`null\`
- a gender the facts did not supply, or one on a sense that is not a noun
- a part of speech different from the one the facts supplied
- a Russian meaning with a Latin homoglyph in it
- an example that does not contain the word, or that fails the Danish spell check
- a batch that came back a different length, or in a different order

None of these are style preferences. Each one is a way a row can look right and be wrong.
`
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const factsPath = valueAfter(argv, '--facts') || 'catalog/facts.jsonl'
  const outDir = valueAfter(argv, '--out') || 'catalog/prompts'
  const rawSize = valueAfter(argv, '--size')
  const size = rawSize === null ? BROWSER_BATCH_SIZE : Number(rawSize)
  if (!Number.isInteger(size) || size < 1) throw new Error('--size must be a positive integer')

  const facts = await readFacts(factsPath)
  if (!facts.length) throw new Error('No facts to generate from')
  await mkdir(outDir, { recursive: true })

  const index: { batch: string; start: number; size: number; first: string; last: string }[] = []
  for (let start = 0, number = 1; start < facts.length; start += size, number += 1) {
    const slice = facts.slice(start, start + size)
    const name = `batch-${String(number).padStart(4, '0')}`
    await writeFile(`${outDir}/${name}.txt`, `${buildCatalogGeneratorPrompt(slice)}\n`, 'utf8')
    index.push({
      batch: `${name}.json`,
      start,
      size: slice.length,
      first: slice[0].lemma,
      last: slice[slice.length - 1].lemma,
    })
  }

  await writeFile(`${outDir}/index.json`, `${JSON.stringify(index, null, 2)}\n`, 'utf8')
  await writeFile(`${outDir}/README.md`, readme(index.length, size, facts.length), 'utf8')
  await writeFile(`${outDir}/phrases.txt`, `${PHRASE_LIST_PROMPT}\n`, 'utf8')

  const silent = facts.filter((fact) => fact.ipa === null).length
  console.log(`Wrote ${index.length} prompt files of ${size} words to ${outDir}/`)
  console.log(`${facts.length} words · ${facts.length - silent} with an IPA · ${silent} that must come back with a null pronunciation`)
  console.log(`Start with ${outDir}/batch-0001.txt and read ${outDir}/README.md`)
  console.log(`${outDir}/phrases.txt asks for the phrase list, which is a separate, later pass`)
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Could not write generator batches')
  process.exitCode = 1
})
