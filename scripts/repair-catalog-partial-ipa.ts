import { createReadStream } from 'node:fs'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import type { CatalogFact, CatalogGeneratedRow } from '../lib/catalog-contract'
import { isCompleteIpa, parseKaikkiLine, selectCatalogIpa, type WiktionaryIpa } from '../lib/catalog-ipa'
import type { PartOfSpeech } from '../lib/types'

function valueAfter(argv: string[], flag: string): string | null {
  const at = argv.indexOf(flag)
  return at >= 0 && at + 1 < argv.length ? argv[at + 1] : null
}

async function readFallbacks(path: string, wanted: ReadonlySet<string>): Promise<Map<string, WiktionaryIpa[]>> {
  const found = new Map<string, WiktionaryIpa[]>()
  const lines = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity })
  for await (const line of lines) {
    const candidate = parseKaikkiLine(line)
    if (!candidate) continue
    const key = candidate.word.toLocaleLowerCase('da-DK')
    if (!wanted.has(key)) continue
    const current = found.get(key)
    if (current) current.push(candidate)
    else found.set(key, [candidate])
  }
  return found
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const ipaPath = valueAfter(argv, '--ipa')
  if (!ipaPath) throw new Error('Required: --ipa <kaikki jsonl>')
  const factsPath = valueAfter(argv, '--facts') || 'catalog/facts.jsonl'
  const ddoPath = valueAfter(argv, '--ddo-ipa') || 'catalog/ddo-ipa.json'
  const outDir = valueAfter(argv, '--out') || 'catalog/out'
  const dryRun = argv.includes('--dry-run')

  const factLines = (await readFile(factsPath, 'utf8')).split(/\r?\n/u).filter(Boolean)
  const facts = factLines.map((line) => JSON.parse(line) as CatalogFact)
  const affected = facts.filter((fact) => fact.ipa !== null && !isCompleteIpa(fact.ipa))
  const wanted = new Set(affected.map((fact) => fact.lemma.toLocaleLowerCase('da-DK')))
  const fallbacks = await readFallbacks(ipaPath, wanted)
  const affectedLemmas = new Set<string>()
  let replaced = 0
  let silenced = 0

  const repairedFacts = facts.map((fact) => {
    if (fact.ipa === null || isCompleteIpa(fact.ipa)) return fact
    affectedLemmas.add(fact.lemma)
    const selection = selectCatalogIpa(
      null,
      fallbacks.get(fact.lemma.toLocaleLowerCase('da-DK')) || [],
      fact.pos as PartOfSpeech | null,
    )
    if (selection.ipa) replaced += 1
    else silenced += 1
    return { ...fact, ipa: selection.ipa, ipa_source: selection.source }
  })

  const ddo = JSON.parse(await readFile(ddoPath, 'utf8')) as Record<string, string>
  const repairedDdo = Object.fromEntries(Object.entries(ddo).filter((entry) => isCompleteIpa(entry[1])))
  const batches = (await readdir(outDir)).filter((name) => /^batch-\d+\.json$/u.test(name)).sort()
  const repairedBatches = new Map<string, string>()
  let clearedPronunciations = 0
  for (const name of batches) {
    const rows = JSON.parse(await readFile(join(outDir, name), 'utf8')) as CatalogGeneratedRow[]
    const repaired = rows.map((row) => {
      if (!affectedLemmas.has(row.lemma) || row.pronunciation === null) return row
      clearedPronunciations += 1
      return { ...row, pronunciation: null }
    })
    repairedBatches.set(name, `${JSON.stringify(repaired, null, 2)}\n`)
  }

  console.log(`${affected.length} facts carried component IPA: ${replaced} replaced from Wiktionary, ${silenced} left null.`)
  console.log(`${Object.keys(ddo).length - Object.keys(repairedDdo).length} component readings removed from DDO harvest.`)
  console.log(`${clearedPronunciations} generated pronunciation hints cleared because their source was incomplete.`)
  if (dryRun) return

  await writeFile(factsPath, `${repairedFacts.map((fact) => JSON.stringify(fact)).join('\n')}\n`, 'utf8')
  await writeFile(ddoPath, `${JSON.stringify(repairedDdo, null, 2)}\n`, 'utf8')
  for (const [name, contents] of repairedBatches) await writeFile(join(outDir, name), contents, 'utf8')
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Catalog IPA repair failed')
  process.exitCode = 1
})
