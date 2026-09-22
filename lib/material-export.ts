import { fsrs, type Card } from 'ts-fsrs'
import { inferDanishInputKind } from '@/lib/entry-kind'
import { activeSenses, nounGenderOf, parseSenses } from '@/lib/senses'
import type { EntrySense, ReviewCard, VocabularyEntry } from '@/lib/types'

export interface ExportReviewLog {
  entryId: string
  rating: 1 | 2 | 3 | 4
  answerResult: 'correct' | 'mostly' | 'incorrect' | null
  answerText: string | null
  previousState: number
  stability: number
  difficulty: number
  scheduledDays: number
  reviewedAt: string
  studyDate: string
}

export interface ExportPracticeAttempt {
  entryId: string
  at: string
  kind: string
  objective: string | null
  result: 'correct' | 'mostly' | 'incorrect' | 'ungraded'
  rating: 1 | 2 | 3 | 4 | null
  assistance: string
  modality: 'typed' | 'spoken'
  responseMs: number
  replays: number
  source?: string | null
  level?: string | null
  practiceSessionId?: string | null
  exerciseId?: string | null
}

export function exportRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function exportString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function exportNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function exportRating(value: unknown): 1 | 2 | 3 | 4 | null {
  return value === 1 || value === 2 || value === 3 || value === 4 ? value : null
}

export function normalizeExportReviewLog(value: unknown): ExportReviewLog | null {
  const row = exportRecord(value)
  const entryId = exportString(row?.entry_id)
  const logRating = exportRating(row?.rating)
  const reviewedAt = exportString(row?.reviewed_at)
  const studyDate = exportString(row?.study_date)
  const previousState = exportNumber(row?.previous_state)
  const stability = exportNumber(row?.stability)
  const difficulty = exportNumber(row?.difficulty)
  const scheduledDays = exportNumber(row?.scheduled_days)
  const answerResult = exportString(row?.answer_result)
  if (!entryId || !logRating || !reviewedAt || !studyDate || previousState === null || stability === null || difficulty === null || scheduledDays === null || (answerResult !== null && answerResult !== 'correct' && answerResult !== 'mostly' && answerResult !== 'incorrect')) return null
  return { entryId, rating: logRating, answerResult, answerText: exportString(row?.answer_text), previousState, stability, difficulty, scheduledDays, reviewedAt, studyDate }
}

export function normalizeExportPracticeAttempt(value: unknown): ExportPracticeAttempt | null {
  const row = exportRecord(value)
  const payload = exportRecord(row?.payload)
  const entryId = exportString(row?.entry_id)
  const at = exportString(payload?.at) || exportString(row?.created_at)
  const kind = exportString(payload?.kind)
  const result = exportString(payload?.result)
  const modality = exportString(payload?.modality)
  const responseMs = exportNumber(payload?.responseMs)
  const replays = exportNumber(payload?.replays)
  const attemptRating = exportRating(payload?.rating)
  if (!entryId || !at || !kind || (result !== 'correct' && result !== 'mostly' && result !== 'incorrect' && result !== 'ungraded') || (modality !== 'typed' && modality !== 'spoken') || responseMs === null || replays === null) return null
  return {
    entryId,
    at,
    kind,
    objective: exportString(payload?.objective),
    result,
    rating: attemptRating,
    assistance: exportString(payload?.assistance) || 'none',
    modality,
    responseMs,
    replays,
    source: exportString(payload?.source),
    level: exportString(payload?.level),
    practiceSessionId: exportString(payload?.practiceSessionId),
    exerciseId: exportString(payload?.exerciseId),
  }
}

const scheduler = fsrs()

function asFsrsCard(card: ReviewCard): Card {
  return {
    due: new Date(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    learning_steps: card.learning_steps,
    state: card.state as Card['state'],
    last_review: card.last_review ? new Date(card.last_review) : undefined,
  }
}

function recallPercent(card: ReviewCard | undefined, now: Date): number | null {
  if (!card || card.state === 0 || !card.last_review) return null
  try {
    return Math.round(Math.max(0, Math.min(1, scheduler.get_retrievability(asFsrsCard(card), now, false))) * 100)
  } catch {
    return null
  }
}

function memoryTier(card: ReviewCard | undefined): string {
  if (!card || card.state === 0 || !card.last_review) return 'new'
  if (card.stability < 1) return 'fragile'
  if (card.stability < 7) return 'building'
  if (card.stability < 30) return 'growing'
  return 'strong'
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function csv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  return [headers.join(','), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(','))].join('\r\n')
}

function senseSummary(senses: EntrySense[]): string {
  return senses.map((sense) => `${sense.text} [${sense.pos || 'unclassified'}${sense.gender ? `, ${sense.gender}` : ''}; ${sense.source}${sense.locked ? '; locked' : ''}]`).join(' | ')
}

function senseCoverage(senses: EntrySense[]): string {
  return senses.map((sense) => `${sense.text}: recognized ${sense.coverage.recognized}, produced ${sense.coverage.produced}, last seen ${sense.coverage.last_seen || 'never'}`).join(' | ')
}

function reviewHistory(logs: ExportReviewLog[]): string {
  return JSON.stringify(logs.map((log) => ({
    reviewed_at: log.reviewedAt,
    study_date: log.studyDate,
    rating: log.rating,
    answer_result: log.answerResult,
    answer_text: log.answerText,
    previous_state: log.previousState,
    stability_days: log.stability,
    difficulty: log.difficulty,
    scheduled_days: log.scheduledDays,
  })))
}

function practiceHistory(attempts: ExportPracticeAttempt[]): string {
  return JSON.stringify(attempts.map((attempt) => ({
    at: attempt.at,
    kind: attempt.kind,
    objective: attempt.objective,
    result: attempt.result,
    rating: attempt.rating,
    assistance: attempt.assistance,
    modality: attempt.modality,
    response_ms: attempt.responseMs,
    replays: attempt.replays,
    ...(attempt.source ? { source: attempt.source } : {}),
    ...(attempt.level ? { level: attempt.level } : {}),
    ...(attempt.practiceSessionId ? { practice_session_id: attempt.practiceSessionId } : {}),
    ...(attempt.exerciseId ? { exercise_id: attempt.exerciseId } : {}),
  })))
}

function reviewCount(logs: ExportReviewLog[], rating: number): number {
  return logs.filter((log) => log.rating === rating).length
}

function resultCount<T extends { result: string }>(items: T[], result: string): number {
  return items.filter((item) => item.result === result).length
}

export function buildMaterialCsv({
  entries,
  cards,
  reviewLogs,
  practiceAttempts,
  exportedAt = new Date(),
}: {
  entries: VocabularyEntry[]
  cards: ReviewCard[]
  reviewLogs: ExportReviewLog[]
  practiceAttempts: ExportPracticeAttempt[]
  exportedAt?: Date
}): string {
  const cardsByEntry = new Map(cards.map((card) => [card.entry_id, card]))
  const logsByEntry = new Map<string, ExportReviewLog[]>()
  const attemptsByEntry = new Map<string, ExportPracticeAttempt[]>()
  for (const log of reviewLogs) logsByEntry.set(log.entryId, [...(logsByEntry.get(log.entryId) || []), log])
  for (const attempt of practiceAttempts) attemptsByEntry.set(attempt.entryId, [...(attemptsByEntry.get(attempt.entryId) || []), attempt])

  const exportedAtIso = exportedAt.toISOString()
  const rows = entries
    .filter((entry) => entry.entry_kind !== 'sentence')
    .map((entry) => {
      const card = cardsByEntry.get(entry.id)
      const senses = activeSenses(parseSenses(entry.senses))
      const logs = logsByEntry.get(entry.id) || []
      const attempts = attemptsByEntry.get(entry.id) || []
      const dates = logs.map((log) => log.reviewedAt).sort()
      const practiceDates = attempts.map((attempt) => attempt.at).sort()
      return {
        export_format: 'ordly-material-v1',
        exported_at: exportedAtIso,
        kind: inferDanishInputKind(entry.danish) === 'word' ? 'word' : 'phrase',
        entry_id: entry.id,
        entry_kind: entry.entry_kind,
        danish: entry.danish,
        pronunciation_cyrillic: entry.pronunciation,
        audio_path: entry.audio_path,
        translation: entry.translation,
        senses: senseSummary(senses),
        senses_json: JSON.stringify(entry.senses),
        sense_coverage: senseCoverage(senses),
        part_of_speech: [...new Set(senses.flatMap((sense) => sense.pos ? [sense.pos] : []))].join(' | '),
        noun_gender: nounGenderOf(senses),
        example_sentence: entry.example_sentence,
        example_translation: entry.example_translation,
        learning_status: entry.learning_status,
        familiarity: entry.familiarity,
        ai_enriched: entry.ai_enriched,
        catalog_lemma: entry.catalog_lemma,
        created_at: entry.created_at,
        updated_at: entry.updated_at,
        estimated_recall_percent: recallPercent(card, exportedAt),
        memory_tier: memoryTier(card),
        next_review_at: card?.due || null,
        card_state: card?.state ?? null,
        stability_days: card?.stability ?? null,
        difficulty: card?.difficulty ?? null,
        repetitions: card?.reps ?? 0,
        lapses: card?.lapses ?? 0,
        learning_steps: card?.learning_steps ?? 0,
        elapsed_days: card?.elapsed_days ?? 0,
        scheduled_days: card?.scheduled_days ?? 0,
        last_review_at: card?.last_review ?? null,
        review_count: logs.length,
        review_again_count: reviewCount(logs, 1),
        review_hard_count: reviewCount(logs, 2),
        review_good_count: reviewCount(logs, 3),
        review_easy_count: reviewCount(logs, 4),
        review_correct_count: logs.filter((log) => log.answerResult === 'correct').length,
        review_mostly_correct_count: logs.filter((log) => log.answerResult === 'mostly').length,
        review_incorrect_count: logs.filter((log) => log.answerResult === 'incorrect').length,
        first_review_at: dates[0] || null,
        latest_review_at: dates.at(-1) || null,
        practice_attempt_count: attempts.length,
        practice_correct_count: resultCount(attempts, 'correct'),
        practice_mostly_correct_count: resultCount(attempts, 'mostly'),
        practice_incorrect_count: resultCount(attempts, 'incorrect'),
        practice_ungraded_count: resultCount(attempts, 'ungraded'),
        practice_typed_count: attempts.filter((attempt) => attempt.modality === 'typed').length,
        practice_spoken_count: attempts.filter((attempt) => attempt.modality === 'spoken').length,
        latest_practice_at: practiceDates.at(-1) || null,
        review_history_json: reviewHistory(logs),
        practice_history_json: practiceHistory(attempts),
      }
    })
  return `\uFEFF${csv(rows)}`
}
