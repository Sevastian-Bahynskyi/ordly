import type { PracticeAttempt, PracticeResponse, PracticeStore, PracticeTask } from './practice'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function text(value: unknown, max = 2000): value is string {
  return typeof value === 'string' && value.length <= max
}

export function isPracticeTask(value: unknown): value is PracticeTask {
  if (!isRecord(value)) return false
  return ['id', 'targetKey', 'prompt', 'answer', 'danish', 'translation', 'hint', 'example'].every((key) => text(value[key]))
    && ['recall', 'produce', 'teach', 'build', 'listen', 'dialogue'].includes(String(value.kind))
    && ['remember', 'learn', 'build', 'speak', 'return'].includes(String(value.stage))
    && [null, 'meaning', 'production'].includes(value.objective as string | null)
    && (value.entryId === null || text(value.entryId, 100))
    && (value.audioText === null || text(value.audioText))
    && ['saved', 'frame', 'ai'].includes(String(value.source))
    && typeof value.newTarget === 'boolean' && Number.isInteger(value.retry) && Number(value.retry) >= 0
    && (value.cardId === undefined || text(value.cardId, 100))
    && (value.contentVersion === undefined || text(value.contentVersion, 100))
}

export function isPracticeResponse(value: unknown): value is PracticeResponse {
  if (!isRecord(value)) return false
  return text(value.answer) && text(value.feedback) && typeof value.revealed === 'boolean'
    && (value.answeredAt === null || (typeof value.answeredAt === 'string' && Number.isFinite(Date.parse(value.answeredAt))))
    && ['correct', 'mostly', 'incorrect', 'ungraded'].includes(String(value.result))
    && ['none', 'hint', 'model', 'transcript'].includes(String(value.assistance))
    && ['typed', 'spoken'].includes(String(value.modality))
    && ['yes', 'no', 'uncertain'].includes(String(value.communication)) && ['yes', 'no', 'uncertain'].includes(String(value.target))
    && Number.isFinite(value.responseMs) && Number(value.responseMs) >= 0 && Number(value.responseMs) <= 3600000
    && Number.isInteger(value.replays) && Number(value.replays) >= 0 && Number(value.replays) <= 100
}

export function isPracticeAttempt(value: unknown): value is PracticeAttempt {
  if (!isRecord(value)) return false
  return ['id', 'taskId', 'targetKey'].every((key) => text(value[key]))
    && [null, 'meaning', 'production'].includes(value.objective as string | null)
    && ['recall', 'produce', 'teach', 'build', 'listen', 'dialogue'].includes(String(value.kind))
    && ['correct', 'mostly', 'incorrect', 'ungraded'].includes(String(value.result))
    && ['none', 'hint', 'model', 'transcript'].includes(String(value.assistance))
    && ['typed', 'spoken'].includes(String(value.modality))
    && [null, 1, 2, 3, 4].includes(value.rating as number | null)
    && Number.isFinite(value.responseMs) && Number(value.responseMs) >= 0
    && Number.isInteger(value.replays) && Number(value.replays) >= 0
    && typeof value.at === 'string' && Number.isFinite(Date.parse(value.at))
    && (value.lastExposureAt === null || (typeof value.lastExposureAt === 'string' && Number.isFinite(Date.parse(value.lastExposureAt))))
    && (value.newTarget === undefined || typeof value.newTarget === 'boolean')
}

export function isPracticeStore(value: unknown): value is PracticeStore {
  if (!isRecord(value) || !Number.isInteger(value.revision) || Number(value.revision) < 0 || !isRecord(value.objectives)) return false
  if (!Object.values(value.objectives).every((objective) => {
    if (!isRecord(objective) || !isPracticeTask(objective.task) || !isRecord(objective.card)) return false
    const card = objective.card
    return typeof card.due === 'string' && Number.isFinite(Date.parse(card.due))
      && (card.last_review === undefined || (typeof card.last_review === 'string' && Number.isFinite(Date.parse(card.last_review))))
      && ['stability', 'difficulty', 'elapsed_days', 'scheduled_days', 'learning_steps', 'reps', 'lapses', 'state'].every((key) => typeof card[key] === 'number' && Number.isFinite(card[key]) && Number(card[key]) >= 0)
      && Number(card.state) <= 3
  })) return false
  const session = value.session
  return session === null || (isRecord(session) && session.version === 1 && text(session.id, 100)
    && Array.isArray(session.queue) && session.queue.length <= 100 && session.queue.every(isPracticeTask)
    && Array.isArray(session.attempts) && session.attempts.length <= 500 && session.attempts.every(isPracticeAttempt)
    && Number.isInteger(session.completed) && Number(session.completed) >= 0
    && Number.isFinite(session.elapsedSeconds) && Number(session.elapsedSeconds) >= 0
    && typeof session.createdAt === 'string' && Number.isFinite(Date.parse(session.createdAt))
    && typeof session.aiEnabled === 'boolean' && Number.isInteger(session.aiCalls) && Number(session.aiCalls) >= 0
    && (session.current === null || isPracticeResponse(session.current)))
}

export interface PracticeFeedback {
  result: 'correct' | 'mostly' | 'incorrect' | 'ungraded'
  feedback: string
  communication: 'yes' | 'no' | 'uncertain'
  target: 'yes' | 'no' | 'uncertain'
}

export function parsePracticeFeedback(value: unknown): PracticeFeedback | null {
  if (!isRecord(value) || !['correct', 'mostly', 'incorrect', 'ungraded'].includes(String(value.result)) || !text(value.feedback, 400)
    || !['yes', 'no', 'uncertain'].includes(String(value.communication)) || !['yes', 'no', 'uncertain'].includes(String(value.target))) return null
  return { result: value.result as PracticeFeedback['result'], feedback: value.feedback, communication: value.communication as PracticeFeedback['communication'], target: value.target as PracticeFeedback['target'] }
}
