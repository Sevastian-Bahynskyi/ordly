import { entrySenses, normalizeSenseText } from './senses'
import type { EntryKind, EntryLinkKind, EntrySense, PartOfSpeech } from './types'

/**
 * Deterministic synonym-candidate generation (D4).
 *
 * Discovery is one AI call per saved entry, and its cost must not grow with the size of the
 * vocabulary (AGENTS.md §16). Three things keep it flat:
 *
 * 1. `synonymSearchTerms` turns the entry's meanings into a handful of terms, so the database
 *    returns only rows that already share a word with it instead of the whole vocabulary.
 * 2. `rankSynonymCandidates` scores that pool offline — sense-text overlap and shared part of
 *    speech — and is the only thing that decides who is worth asking about.
 * 3. `SYNONYM_CANDIDATE_LIMIT` caps what the model ever sees, regardless of pool size.
 *
 * The model never sees the vocabulary; it sees at most eight candidates that a string
 * comparison already liked.
 */

/** How many candidates a single discovery call may score. This is the cost bound. */
export const SYNONYM_CANDIDATE_LIMIT = 8

/** How many terms the database pre-filter may search for. */
export const SYNONYM_SEARCH_TERM_LIMIT = 12

/** How many rows the database pre-filter may return before ranking. */
export const SYNONYM_POOL_LIMIT = 200

/** Below this a deterministic match is noise and is not worth an AI opinion. */
export const SYNONYM_MIN_SCORE = 0.2

/**
 * Function words that would otherwise make every entry look related to every other. Kept
 * deliberately small — this is noise suppression, not linguistics. Covers the three supported
 * translation languages plus English glosses.
 */
const STOP_WORDS = new Set([
  'to', 'the', 'a', 'an', 'be', 'and', 'or', 'of', 'in', 'on', 'it', 'is', 'as', 'at', 'for',
  'что', 'это', 'как', 'для', 'быть', 'так', 'его', 'она', 'они', 'или', 'же', 'не',
  'що', 'це', 'як', 'для', 'бути', 'так', 'його', 'вона', 'вони', 'або',
])

/** Characters that would break a PostgREST `or=(...)` filter or act as a LIKE wildcard. */
const UNSAFE_TERM_CHARS = /[%_*\\,().:"']/g

export interface SynonymEntry {
  id: string
  danish: string
  translation?: string | null
  senses?: unknown
  /** `vocabulary_entries.entry_kind` is NOT NULL in the database; optional here for pool rows. */
  entry_kind?: EntryKind
}

export interface SynonymCandidate {
  id: string
  danish: string
  translation: string | null
  /** 0..1, deterministic. Feeds the ordering only — the AI assigns the stored confidence. */
  score: number
  /**
   * The one sense pair that scored best, kept apart rather than merged into a set.
   *
   * This is what the model is asked to rule on. Handing it both entries' full meaning lists
   * invites a yes because *something* overlapped, which is how a third meaning of `lige` made
   * the whole entry a synonym of `kun`.
   */
  sourceSense: string
  candidateSense: string
  /** Parts of speech seen on the candidate's evidence senses. */
  pos: PartOfSpeech[]
}

export interface RankSynonymOptions {
  limit?: number
  minScore?: number
  /** Entries the caller has already ruled on. */
  excludeIds?: readonly string[]
}

/** The subset of an `entry_links` row this module needs. */
export interface SynonymLinkRow {
  a_id: string
  b_id: string
  kind: EntryLinkKind
  confirmed?: boolean
  /** A dismissed suggestion's tombstone. Readers normally filter these in the query already. */
  dismissed_at?: string | null
}

/**
 * The senses discovery is allowed to reason from.
 *
 * `source: 'user'` senses are excluded on purpose (§4). They come from the learner pressing
 * `My answer was right`, so feeding them back into discovery would let the graph learn from its
 * own output: a loose answer becomes a sense, the sense becomes evidence, the evidence becomes
 * an edge, and the edge then grades the next loose answer as correct.
 */
export function discoverySenses(entry: SynonymEntry | null | undefined): EntrySense[] {
  return entrySenses(entry).filter((sense) => sense.source !== 'user')
}

function normalizedDanish(value: string): string {
  return normalizeSenseText(value)
}

/**
 * Tokens for the database pre-filter. Stop words are dropped here because searching for them
 * would drag back half the vocabulary.
 */
function searchTokens(text: string): Set<string> {
  const normalized = normalizeSenseText(text)
  if (!normalized) return new Set()
  const tokens = normalized.split(' ').filter((token) => token.length > 1 && !STOP_WORDS.has(token))
  // A single short meaning ("дом") must still be searchable, so fall back to the whole string.
  return new Set(tokens.length ? tokens : [normalized].filter(Boolean))
}

/**
 * Tokens for comparing two meanings. Every word counts, including the ones `STOP_WORDS` hides
 * from the search.
 *
 * A stop word is noise when deciding what to *fetch* and meaning when deciding what *matches*:
 * "только" and "только что" are two different meanings, and `что` is the entire difference
 * between them. Stripping it made them identical and joined `kun` to `lige`.
 */
function compareTokens(text: string): Set<string> {
  const normalized = normalizeSenseText(text)
  if (!normalized) return new Set()
  return new Set(normalized.split(' ').filter(Boolean))
}

/** Sørensen-Dice over token sets: symmetric, and forgiving of one side being wordier. */
function dice(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0
  let shared = 0
  for (const token of left) if (right.has(token)) shared += 1
  if (!shared) return 0
  return (2 * shared) / (left.size + right.size)
}

function senseSimilarity(left: string, right: string): number {
  const a = normalizeSenseText(left)
  const b = normalizeSenseText(right)
  if (!a || !b) return 0
  if (a === b) return 1
  return dice(compareTokens(a), compareTokens(b))
}

function partsOfSpeech(senses: readonly EntrySense[]): PartOfSpeech[] {
  return [...new Set(senses.map((sense) => sense.pos).filter((pos): pos is PartOfSpeech => Boolean(pos)))]
}

/**
 * 1 when the two entries share a part of speech, 0 when both are known and disjoint, 0.5 when
 * either side has no part of speech yet — an un-enriched entry should not be punished for it.
 */
function partOfSpeechScore(left: readonly PartOfSpeech[], right: readonly PartOfSpeech[]): number {
  if (!left.length || !right.length) return 0.5
  return left.some((pos) => right.includes(pos)) ? 1 : 0
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

/**
 * Terms for the database pre-filter. Longest first: a longer term is more selective, so the
 * pool comes back smaller. Already free of the punctuation `normalizeSenseText` strips; the
 * remaining wildcard and delimiter characters are removed so the term is safe to interpolate
 * into a PostgREST filter.
 */
export function synonymSearchTerms(
  entry: SynonymEntry | null | undefined,
  limit: number = SYNONYM_SEARCH_TERM_LIMIT,
): string[] {
  const terms = new Set<string>()
  for (const sense of discoverySenses(entry)) {
    const whole = normalizeSenseText(sense.text)
    if (whole) terms.add(whole)
    for (const token of searchTokens(sense.text)) terms.add(token)
  }

  return [...terms]
    .map((term) => term.replace(UNSAFE_TERM_CHARS, ' ').trim())
    .filter((term) => term.length > 1)
    .sort((a, b) => b.length - a.length || a.localeCompare(b))
    .slice(0, Math.max(0, limit))
}

/** `or=(...)` filter matching any of the terms against the denormalized translation column. */
export function synonymSearchFilter(terms: readonly string[]): string {
  return terms.map((term) => `translation.ilike.*${term}*`).join(',')
}

/**
 * Score a pool of saved entries against one entry and return the best few.
 *
 * Offline and deterministic: same inputs, same order out. Entries with no shared meaning score
 * nothing and never reach the model.
 */
export function rankSynonymCandidates(
  source: SynonymEntry,
  pool: readonly SynonymEntry[],
  options: RankSynonymOptions = {},
): SynonymCandidate[] {
  const limit = options.limit ?? SYNONYM_CANDIDATE_LIMIT
  const minScore = options.minScore ?? SYNONYM_MIN_SCORE
  const excluded = new Set(options.excludeIds || [])

  const sourceSenses = discoverySenses(source)
  if (!sourceSenses.length) return []
  const sourcePos = partsOfSpeech(sourceSenses)
  const sourceDanish = normalizedDanish(source.danish)

  const candidates: SynonymCandidate[] = []
  for (const entry of pool) {
    if (!entry || entry.id === source.id || excluded.has(entry.id)) continue
    // Synonymy between whole sentences is not a useful claim, and it would blow up the pool.
    if (entry.entry_kind === 'sentence') continue
    // Same Danish text is a duplicate entry, not a synonym.
    if (normalizedDanish(entry.danish) === sourceDanish) continue

    const entrySensesForEntry = discoverySenses(entry)
    if (!entrySensesForEntry.length) continue

    let best = 0
    let sourceSense = ''
    let candidateSense = ''
    for (const left of sourceSenses) {
      for (const right of entrySensesForEntry) {
        const similarity = senseSimilarity(left.text, right.text)
        if (similarity > best) {
          best = similarity
          sourceSense = left.text.trim()
          candidateSense = right.text.trim()
        }
      }
    }
    if (best <= 0) continue

    const pos = partsOfSpeech(entrySensesForEntry)
    const score = round(0.75 * best + 0.25 * partOfSpeechScore(sourcePos, pos))
    if (score < minScore) continue

    candidates.push({
      id: entry.id,
      danish: entry.danish,
      translation: entry.translation ?? null,
      score,
      sourceSense,
      candidateSense,
      pos,
    })
  }

  return candidates
    .sort((a, b) => b.score - a.score || a.danish.localeCompare(b.danish, 'da-DK') || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, limit))
}

/* ---- Concept validation ---------------------------------------------------------------- */

const CYRILLIC = /\p{Script=Cyrillic}/u
const LATIN = /\p{Script=Latin}/u

/**
 * Reject a concept the model wrote in the wrong script.
 *
 * The prompt asks for the shared meaning in the learner's own language, and a model that answers
 * in English has stopped reasoning in that language — which is exactly how `bare` ("только")
 * became a synonym of `lige` ("только что") under the concept "just now". English "just" spans
 * *only* and *just now*; Russian keeps them apart. Once the answer drifts to English the
 * distinction the learner's language was carrying is already gone, so the edge is not trustworthy
 * whatever its confidence.
 *
 * Script, not language: telling Russian from Ukrainian needs real detection and buys nothing
 * here, because both keep the distinction English loses. Cyrillic senses with a purely Latin
 * concept is the whole failure mode.
 */
export function conceptMatchesSenseScript(concept: string, senseTexts: readonly string[]): boolean {
  const text = (concept || '').trim()
  if (!text) return false
  const senses = senseTexts.filter(Boolean).join(' ')
  // Nothing to compare against, or the learner's own language is Latin-scripted: allow it.
  if (!CYRILLIC.test(senses)) return true
  return CYRILLIC.test(text) || !LATIN.test(text)
}

/**
 * Canonical (a_id, b_id) for a symmetric edge, matching the `a_id < b_id` check in
 * `entry_links`. Postgres compares uuids byte-wise, which for the canonical lowercase text form
 * is the same as comparing the strings — hence the lowercase before comparing.
 */
export function canonicalLinkPair(first: string, second: string): { a_id: string; b_id: string } {
  const left = first.toLowerCase()
  const right = second.toLowerCase()
  return left < right ? { a_id: left, b_id: right } : { a_id: right, b_id: left }
}

/**
 * The entries joined to `entryId` by a `synonym` edge, in either direction.
 *
 * `confirmedOnly` is the D17/graph-honesty switch. Grading reads every synonym edge (§4), but
 * anything that would teach — practice distractors above all — must pass `confirmedOnly: true`,
 * because an unconfirmed edge is a guess nobody has accepted.
 */
export function synonymNeighbourIds(
  entryId: string,
  links: readonly SynonymLinkRow[],
  options: { confirmedOnly?: boolean } = {},
): string[] {
  const id = entryId.toLowerCase()
  const neighbours = new Set<string>()
  for (const link of links || []) {
    if (!link || link.kind !== 'synonym' || link.dismissed_at) continue
    if (options.confirmedOnly && !link.confirmed) continue
    const a = String(link.a_id || '').toLowerCase()
    const b = String(link.b_id || '').toLowerCase()
    if (a === id && b) neighbours.add(b)
    else if (b === id && a) neighbours.add(a)
  }
  return [...neighbours]
}

/**
 * Every non-removed sense of `entryId`'s synonym neighbours, ready to hand to `checkAnswer`
 * as `linkedSenses` (§4). Deterministic and offline: no network call belongs in grading.
 */
export function linkedSensesFor(
  entryId: string,
  links: readonly SynonymLinkRow[],
  entries: readonly SynonymEntry[],
  options: { confirmedOnly?: boolean } = {},
): EntrySense[] {
  const neighbours = new Set(synonymNeighbourIds(entryId, links, options))
  if (!neighbours.size) return []
  const senses: EntrySense[] = []
  for (const entry of entries || []) {
    if (!entry || !neighbours.has(String(entry.id || '').toLowerCase())) continue
    senses.push(...entrySenses(entry))
  }
  return senses
}
