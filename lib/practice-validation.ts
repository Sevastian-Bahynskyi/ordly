import { TARGET_KEY_MAX_LENGTH } from './practice-senses'
import { isPracticeMinutes, isTranslationLanguage, type PracticeAttempt, type PracticeDraft, type PracticeDraftInput, type PracticeResponse, type PracticeSessionState, type PracticeTask } from './practice'
import type { ReviewItem } from './types'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function text(value: unknown, max = 2000): value is string {
  return typeof value === 'string' && value.length <= max
}

function date(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

export function isReviewSource(value: unknown): value is ReviewItem {
  if (!isRecord(value) || !isRecord(value.vocabulary_entries)) return false
  const entry = value.vocabulary_entries
  const nullableText = (input: unknown): boolean => input === null || text(input)
  const uuid = (input: unknown): boolean => typeof input === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input)
  return ['id', 'user_id', 'entry_id'].every((key) => uuid(value[key]))
    && ['id', 'user_id'].every((key) => uuid(entry[key])) && value.entry_id === entry.id && value.user_id === entry.user_id
    && text(entry.danish, 200) && entry.danish.trim().length > 0 && text(entry.translation) && entry.translation.trim().length > 0
    && ['pronunciation', 'example_sentence', 'example_translation', 'icon_name'].every((key) => nullableText(entry[key]))
    && ['word', 'sentence'].includes(String(entry.entry_kind)) && ['new', 'learning', 'mastered'].includes(String(entry.learning_status))
    && Number.isInteger(entry.familiarity) && Number(entry.familiarity) >= 0 && Number(entry.familiarity) <= 2 && typeof entry.ai_enriched === 'boolean'
    && date(entry.created_at) && date(entry.updated_at) && date(value.due) && (value.last_review === null || date(value.last_review))
    && ['stability', 'difficulty', 'elapsed_days', 'scheduled_days', 'reps', 'lapses', 'learning_steps', 'state'].every((key) => typeof value[key] === 'number' && Number.isFinite(value[key]) && Number(value[key]) >= 0)
    && Number(value.state) <= 3
}

const TASK_KINDS = ['pick', 'choose', 'assemble', 'cloze', 'produce', 'sense']
/** Attempts recorded under the retired contract carry these kinds too; they stay readable history. */
const ATTEMPT_KINDS = [...TASK_KINDS, 'recall', 'teach', 'build', 'listen', 'dialogue']
const ASSISTANCE = ['none', 'hint', 'choices', 'model']
const RESULTS = ['correct', 'mostly', 'incorrect', 'unverified', 'dont_know']

/** An answer open longer than an hour is recorded as an hour. */
const MAX_RESPONSE_MS = 3_600_000

/** No board is bigger than this. A longer list is corrupt state, not an exercise. */
const MAX_CHOICES = 16

function isChoiceList(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.length <= MAX_CHOICES && value.every((choice) => text(choice, 200)))
}

export function isPracticeTask(value: unknown): value is PracticeTask {
  if (!isRecord(value)) return false
  return ['id', 'prompt', 'answer', 'danish', 'translation', 'hint', 'example'].every((key) => text(value[key]))
    && text(value.targetKey, TARGET_KEY_MAX_LENGTH) && value.targetKey.length > 0
    && text(value.entryId, 100) && value.entryId.length > 0 && text(value.senseId, 100) && value.senseId.length > 0
    && TASK_KINDS.includes(String(value.kind))
    && typeof value.answerIsSentence === 'boolean' && text(value.contentVersion, 100)
    && typeof value.newTarget === 'boolean' && Number.isInteger(value.retry) && Number(value.retry) >= 0
    && isChoiceList(value.choices)
    && (value.contrast === undefined || text(value.contrast))
    && (value.context === undefined || text(value.context))
}

export function isPracticeResponse(value: unknown): value is PracticeResponse {
  if (!isRecord(value)) return false
  return text(value.answer) && text(value.feedback, 400) && typeof value.revealed === 'boolean'
    && (value.answeredAt === null || date(value.answeredAt))
    && (value.result === null || RESULTS.includes(String(value.result)))
    && (value.revealed ? value.result !== null : value.result === null)
    && ASSISTANCE.includes(String(value.assistance))
    && Number.isFinite(value.responseMs) && Number(value.responseMs) >= 0 && Number(value.responseMs) <= MAX_RESPONSE_MS
    && (value.reported === undefined || typeof value.reported === 'boolean')
}

export function isPracticeDraft(value: unknown): value is PracticeDraft {
  return isRecord(value) && text(value.taskId) && text(value.answer)
    && Array.isArray(value.picked) && value.picked.length <= MAX_CHOICES
    && value.picked.every((index) => Number.isInteger(index) && index >= 0 && index < MAX_CHOICES)
    && new Set(value.picked).size === value.picked.length
}

export function isPracticeAttempt(value: unknown): value is PracticeAttempt {
  if (!isRecord(value)) return false
  return ['id', 'taskId'].every((key) => text(value[key]))
    // The database caps `practice_attempts.target_key` at 100 characters; fail here, not there.
    && text(value.targetKey, TARGET_KEY_MAX_LENGTH)
    && ATTEMPT_KINDS.includes(String(value.kind))
    && [...RESULTS, 'ungraded'].includes(String(value.result))
    && [...ASSISTANCE, 'transcript'].includes(String(value.assistance))
    && Number.isFinite(value.responseMs) && Number(value.responseMs) >= 0
    && date(value.at)
    && (value.entryId === undefined || value.entryId === null || text(value.entryId, 100))
    && (value.rating === undefined || [null, 1, 2, 3, 4].includes(value.rating as number | null))
    && (value.newTarget === undefined || typeof value.newTarget === 'boolean')
    && (value.reported === undefined || typeof value.reported === 'boolean')
    && (value.answer === undefined || text(value.answer))
}

export function isPracticeSession(value: unknown): value is PracticeSessionState {
  if (!isRecord(value)) return false
  const session = value
  return session.version === 2 && text(session.id, 100) && text(session.seed, 100) && text(session.contentRevision, 100)
    && isPracticeMinutes(session.targetMinutes) && isTranslationLanguage(session.locale)
    && typeof session.finished === 'boolean'
    && Array.isArray(session.queue) && session.queue.length <= 100 && session.queue.every(isPracticeTask)
    && (!session.finished || (session.queue.length === 0 && session.current === null && session.activeSince === null))
    && Array.isArray(session.attempts) && session.attempts.length <= 500 && session.attempts.every(isPracticeAttempt)
    && Number.isInteger(session.completed) && Number(session.completed) >= 0
    && Number.isFinite(session.elapsedSeconds) && Number(session.elapsedSeconds) >= 0
    && date(session.createdAt) && (session.activeSince === null || date(session.activeSince))
    && (session.current === null || isPracticeResponse(session.current))
    && (session.draft === null || isPracticeDraft(session.draft))
}

/** What the Practice API accepts. Anything else, including the retired Review-rating payloads, is refused. */
export type PracticeRequest =
  | { kind: 'start'; minutes: number; acceptShorter: boolean }
  | { kind: 'act'; action: PracticeActionInput }
  | { kind: 'retired' }

export type PracticeActionInput =
  | { action: 'resume' | 'finish' | 'help' | 'next' | 'report'; revision: number; taskId: string }
  | { action: 'pause'; revision: number; taskId: string; draft: PracticeDraftInput | null }
  | { action: 'answer'; revision: number; taskId: string; answer: string; responseMs: number }

/** Actions only an older Practice client sends. They used to reach Review; now they are refused. */
const RETIRED_ACTIONS = ['rate', 'accept', 'repair']

export function parsePracticeRequest(body: unknown): PracticeRequest | null {
  if (!isRecord(body)) return null
  if (RETIRED_ACTIONS.includes(String(body.action)) || 'rating' in body || 'aiEnabled' in body) return { kind: 'retired' }
  if (body.action === 'start') {
    if (!isPracticeMinutes(body.minutes) || (body.acceptShorter !== undefined && typeof body.acceptShorter !== 'boolean')) return null
    return { kind: 'start', minutes: body.minutes, acceptShorter: body.acceptShorter === true }
  }
  if (!Number.isInteger(body.revision) || Number(body.revision) < 0 || !text(body.taskId, 2000)) return null
  const common = { revision: Number(body.revision), taskId: body.taskId }
  switch (body.action) {
    case 'resume': case 'finish': case 'help': case 'next': case 'report':
      return { kind: 'act', action: { action: body.action, ...common } }
    case 'pause': {
      if (body.draft !== undefined && body.draft !== null && !(isRecord(body.draft) && isPracticeDraft({ ...body.draft, taskId: common.taskId }))) return null
      const draft: PracticeDraftInput | null = isRecord(body.draft) ? { answer: String(body.draft.answer), picked: body.draft.picked as number[] } : null
      return { kind: 'act', action: { action: 'pause', ...common, draft } }
    }
    case 'answer':
      if (!text(body.answer) || typeof body.responseMs !== 'number' || !Number.isFinite(body.responseMs) || body.responseMs < 0) return null
      return { kind: 'act', action: { action: 'answer', ...common, answer: body.answer, responseMs: Math.min(MAX_RESPONSE_MS, body.responseMs) } }
    default:
      return null
  }
}
