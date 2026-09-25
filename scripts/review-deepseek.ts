/**
 * DeepSeek review stage (issue #16): an independent read of generated content against the full
 * linguistic rubric, after the deterministic gate and before the seeded human audit.
 *
 * The reviewer never edits Danish. A finding on the Danish (grammar, naturalness, sense, level,
 * matrix cell, gap ambiguity) sends the item back to its generator with the finding as a required
 * correction — the family's work row gets a `note`, the phrase's selection entry gets a `note` —
 * and the item is removed from the reply so the next generator run rewrites it and every gate runs
 * again. A finding only on a machine translation is repaired in place with the reviewer's wording,
 * logged beside the original. Every verdict is written to the review log.
 *
 *   pnpm exec tsx --env-file=.env.corpus.local scripts/review-deepseek.ts --families catalog/families/out/batch-0200.json [--apply]
 *   pnpm exec tsx --env-file=.env.corpus.local scripts/review-deepseek.ts --phrases catalog/phrases/out/batch-0001.json [--selection catalog/phrases/pilot.json] [--apply]
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { variantDanish, type FamilyReply } from '../lib/catalog-families'
import type { CatalogGeneratedRow } from '../lib/catalog-contract'
import type { LocaleFile } from '../lib/catalog-locale'
import { deepseekJson, MODEL, spendLine, translationFidelityOk } from './azure-corpus'

const argv = process.argv.slice(2)
const option = (flag: string): string | null => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null)
const familiesPath = option('--families')
const phrasesPath = option('--phrases')
const apply = argv.includes('--apply')
if (!familiesPath === !phrasesPath) {
  console.error('Usage: review-deepseek.ts (--families <out/batch.json> | --phrases <phrases/out/batch.json>) [--apply]')
  process.exit(1)
}

const RUBRIC = `You are a senior Danish linguist and language teacher reviewing content for a Danish course for
adult learners (A1–B2) whose languages are English and Russian. Judge strictly against this rubric,
and only flag real defects — not style preferences between two correct options:
1. grammar: grammatically correct Danish (V2, inversion, subordinate-clause adverb placement, agreement,
   definiteness, sin/hans, der/som, tense).
2. natural: idiomatic Danish a native speaker would actually say in that situation; no calques.
3. sense: demonstrates exactly the stated meaning of the target, and a reader of the Danish alone would
   recover that meaning.
4. en: the English translation is faithful (tense, person, number, meaning; nothing added or dropped)
   and natural.
5. ru: the Russian translation is faithful and natural.
6. pedagogy: safe to teach — no wrong or misleading model, level-appropriate, and (for a gap exercise)
   no other common word would also correctly fill the target's place unless it is listed as accepted.
Method for en and ru — do this for every sentence, silently: align each Danish content word and each
grammatical choice with its rendering. A defect is a word rendered with a different meaning (ferie →
"праздник" instead of "отпуск"/"каникулы"; lyd "sound/noise" → "звучание"), a changed or dropped person
(du → an impersonal "нужно"), a changed tense or aspect (har ventet "has been waiting" → "ждал"), an
added or dropped content word, or an unnatural, clumsy or redundant rendering a native translator would
not write ("в семь утра каждое утро"). Also a sense gloss that names a different or narrower meaning
than the expression has is a defect.
Reply with one JSON object and nothing else.`

interface Finding { item: number; ok: boolean; criteria: string[]; problem: string; danish_ok: boolean; en?: string; ru?: string }

/**
 * Only a finding confined to the translations, with a replacement for each translation it faults,
 * may be repaired in place. Anything touching the Danish, the sense or the gloss goes back to the
 * generator: a new translation fitted to a wrong gloss makes the item worse, not better (observed:
 * `oven på` "вдобавок к" had its correct "после долгого дня" rewritten to fit the wrong gloss).
 */
function needsRegeneration(finding: Finding): boolean {
  const criteria = Array.isArray(finding.criteria) ? finding.criteria : []
  if (!finding.danish_ok || !criteria.length || criteria.some((name) => name !== 'en' && name !== 'ru')) return true
  return (criteria.includes('en') && !finding.en?.trim()) || (criteria.includes('ru') && !finding.ru?.trim())
}

function reviewFamilyPrompt(): string {
  return `${RUBRIC}

You receive one sentence family: a target (lemma, kind, sense), its CEFR level and grammar cell
("grammar" names the feature the sentences must actually exercise), and its sentences, each with
the target form, English and Russian, and any accepted alternative gap answers. Also check that the
sentences really exercise the stated grammar cell and suit the level.
Reply: {"items": [{"item": <sentence index from 1>, "ok": true|false, "criteria": [<failed rubric names>],
"problem": "<what is wrong, concretely>", "danish_ok": true|false,
"en": "<corrected English, only if only the English is wrong>", "ru": "<corrected Russian, only if only the Russian is wrong>"}]}
Every sentence gets one item.`
}

function reviewPhrasePrompt(): string {
  return `${RUBRIC}

You receive one Danish multi-word expression with its senses. Each sense has a Russian meaning, an
English meaning, a Danish example, and the example's English and Russian translations. Also check
that each meaning is a real, current meaning of the expression, that Russian and English name the
same meaning, and that no common meaning a B2 learner needs is wrong.
Reply: {"items": [{"item": <sense ordinal>, "ok": true|false, "criteria": [<failed rubric names>],
"problem": "<what is wrong, concretely>", "danish_ok": true|false,
"en": "<corrected English example translation, only if only it is wrong>", "ru": "<corrected Russian example translation, only if only it is wrong>"}]}
Every sense gets one item. A wrong meaning wording is danish_ok = false.`
}

function parseFindings(reply: unknown, count: number): Finding[] | null {
  const items = (reply as { items?: unknown }).items
  if (!Array.isArray(items)) return null
  const findings = items.filter((raw): raw is Finding => typeof raw === 'object' && raw !== null && Number.isInteger((raw as Finding).item) && typeof (raw as Finding).ok === 'boolean')
  return findings.length === count ? findings : null
}

async function review(label: string, system: string, payload: unknown, count: number): Promise<Finding[]> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const reply = await deepseekJson('deepseek.review', label, system, JSON.stringify(payload), { maxTokens: 1500, temperature: 0 })
    const findings = parseFindings(reply, count)
    if (findings) return findings
  }
  throw new Error(`${label}: reviewer did not return one verdict per item`)
}

const logDir = familiesPath ? join(dirname(dirname(familiesPath)), 'review') : join(dirname(dirname(phrasesPath as string)), 'review')
await mkdir(logDir, { recursive: true })
const inputPath = (familiesPath || phrasesPath) as string
const logPath = join(logDir, `deepseek-${basename(inputPath)}`)
const log: { reviewer: string; at: string; entries: unknown[] } = { reviewer: MODEL, at: new Date().toISOString(), entries: [] }
let flagged = 0
let checked = 0

if (familiesPath) {
  const replies = JSON.parse(await readFile(familiesPath, 'utf8')) as (FamilyReply | { skip: string })[]
  const workPath = familiesPath.replace('/out/', '/work/')
  const work = JSON.parse(await readFile(workPath, 'utf8')) as { sense_id: string; ru: string; en: string | null; note?: string; target?: { level: string; situation: string; grammar: string } }[]
  const kept: unknown[] = []
  for (const reply of replies) {
    if ('skip' in reply) { kept.push(reply); continue }
    const row = work.find((entry) => entry.sense_id === reply.sense_id && (!entry.target || (entry.target.level === reply.level && entry.target.situation === reply.situation && entry.target.grammar === reply.grammar)))
    const sentences = reply.variants.map((variant, index) => ({ item: index + 1, danish: variantDanish(reply, variant), target: variant.target, en: variant.en, ru: variant.ru, accepted: variant.accepted ?? [] }))
    const findings = await review(reply.lemma, reviewFamilyPrompt(), { lemma: reply.lemma, kind: reply.kind, meaning_ru: row?.ru, meaning_en: row?.en, level: reply.level, situation: reply.situation, grammar: reply.grammar, sentences }, sentences.length)
    checked += sentences.length
    const bad = findings.filter((finding) => !finding.ok)
    log.entries.push({ lemma: reply.lemma, sense_id: reply.sense_id, findings })
    if (!bad.length) { kept.push(reply); continue }
    flagged += 1
    const danishProblems = bad.filter(needsRegeneration)
    console.log(`✗ ${reply.lemma}: ${bad.map((finding) => `#${finding.item} [${finding.criteria.join(',')}] ${finding.problem}`).join(' | ')}`)
    if (!apply) { kept.push(reply); continue }
    if (danishProblems.length) {
      // Back to the generator: the finding becomes the required correction for the rewrite.
      if (row) row.note = `An independent reviewer rejected the previous family: ${danishProblems.map((finding) => finding.problem).join(' ')} Write a new family that avoids this.`
      continue
    }
    const repairs: unknown[] = []
    let drifted = false
    const variants = []
    for (const [index, variant] of reply.variants.entries()) {
      const finding = bad.find((entry) => entry.item === index + 1)
      if (!finding) { variants.push(variant); continue }
      const next = { ...variant, ...(finding.en?.trim() ? { en: finding.en.trim() } : {}), ...(finding.ru?.trim() ? { ru: finding.ru.trim() } : {}) }
      if (!(await translationFidelityOk(variantDanish(reply, variant) as string, next.en, next.ru))) drifted = true
      repairs.push({ item: index + 1, before: { en: variant.en, ru: variant.ru }, after: { en: next.en, ru: next.ru } })
      variants.push(next)
    }
    if (drifted) {
      if (row) row.note = `An independent reviewer rejected the previous family's translations and its fix did not survive the round-trip check: ${bad.map((finding) => finding.problem).join(' ')} Write a new family.`
      continue
    }
    log.entries.push({ lemma: reply.lemma, sense_id: reply.sense_id, repairs })
    kept.push({ ...reply, variants })
  }
  if (apply) {
    await writeFile(familiesPath, `${JSON.stringify(kept, null, 1)}\n`)
    await writeFile(workPath, `${JSON.stringify(work, null, 1)}\n`)
  }
} else {
  const path = phrasesPath as string
  const rows = JSON.parse(await readFile(path, 'utf8')) as CatalogGeneratedRow[]
  const localePath = 'catalog/phrases/locale-en.json'
  const locale = JSON.parse(await readFile(localePath, 'utf8')) as LocaleFile
  const selectionPath = option('--selection') || 'catalog/phrases/pilot.json'
  const selection = existsSync(selectionPath) ? JSON.parse(await readFile(selectionPath, 'utf8')) as { phrases: { phrase: string; note?: string }[] } : { phrases: [] }
  const kept: CatalogGeneratedRow[] = []
  const dropped = new Set<string>()
  for (const row of rows) {
    const senses = row.senses.map((sense) => {
      const en = locale.senses.find((entry) => entry.lemma === row.lemma && entry.ordinal === sense.ordinal)
      return { item: sense.ordinal, meaning_ru: sense.text, meaning_en: en?.text, example: sense.example, example_en: en?.example_translation, example_ru: sense.example_translation }
    })
    const findings = await review(row.lemma, reviewPhrasePrompt(), { phrase: row.lemma, part_of_speech: row.senses[0]?.pos, senses }, senses.length)
    checked += senses.length
    const bad = findings.filter((finding) => !finding.ok)
    log.entries.push({ phrase: row.lemma, findings })
    if (!bad.length) { kept.push(row); continue }
    flagged += 1
    console.log(`✗ ${row.lemma}: ${bad.map((finding) => `#${finding.item} [${finding.criteria.join(',')}] ${finding.problem}`).join(' | ')}`)
    if (!apply) { kept.push(row); continue }
    const danishProblems = bad.filter(needsRegeneration)
    if (danishProblems.length) {
      const entry = selection.phrases.find((item) => item.phrase === row.lemma)
      if (entry) entry.note = `An independent reviewer rejected the previous senses: ${danishProblems.map((finding) => finding.problem).join(' ')} Avoid this.`
      dropped.add(row.lemma)
      continue
    }
    const repairs: unknown[] = []
    let drifted = false
    for (const finding of bad) {
      const sense = row.senses.find((entry) => entry.ordinal === finding.item)
      const localized = locale.senses.find((entry) => entry.lemma === row.lemma && entry.ordinal === finding.item)
      if (!sense || !localized) continue
      const en = finding.en?.trim() || localized.example_translation || ''
      const ru = finding.ru?.trim() || sense.example_translation
      if (!(await translationFidelityOk(sense.example, en, ru))) { drifted = true; break }
      repairs.push({ item: finding.item, before: { en: localized.example_translation, ru: sense.example_translation }, after: { en, ru } })
      sense.example_translation = ru
      localized.example_translation = en
    }
    if (drifted) {
      const entry = selection.phrases.find((item) => item.phrase === row.lemma)
      if (entry) entry.note = `An independent reviewer rejected the previous example's translations and its fix did not survive the round-trip check: ${bad.map((finding) => finding.problem).join(' ')} Write a new example.`
      dropped.add(row.lemma)
      continue
    }
    log.entries.push({ phrase: row.lemma, repairs })
    kept.push(row)
  }
  if (apply) {
    await writeFile(path, `${JSON.stringify(kept, null, 1)}\n`)
    locale.senses = locale.senses.filter((entry) => !dropped.has(entry.lemma))
    await writeFile(localePath, `${JSON.stringify(locale, null, 1)}\n`)
    if (existsSync(selectionPath)) await writeFile(selectionPath, `${JSON.stringify(selection, null, 1)}\n`)
  }
}

await writeFile(logPath, `${JSON.stringify(log, null, 1)}\n`)
console.log(`reviewed ${checked} item(s); ${flagged} flagged${apply ? ' (applied)' : ''} → ${logPath} · ${spendLine()}`)
