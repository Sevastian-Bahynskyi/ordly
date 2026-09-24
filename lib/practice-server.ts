import type { SupabaseClient } from '@supabase/supabase-js'
import {
  activeSeconds, finishPracticeTask, isChoiceKind, isReportable, isTranslationLanguage, queueSeconds, targetReached, NEAR_TARGET_SECONDS,
  type PracticeAttempt, type PracticeResponse, type PracticeSessionState, type PracticeStore,
} from './practice'
import { planPractice } from './practice-planner'
import { gradePracticeAnswer, isOfferedChoice } from './practice-grading'
import { currentTaskContentVersion } from './practice-content'
import { isPracticeAttempt, isPracticeSession, isRecord, isReviewSource, type PracticeActionInput } from './practice-validation'

/**
 * The Practice session boundary (issue #13).
 *
 * Everything a Practice action writes goes through `commit_practice`: the session itself and, when
 * an exercise is finished, one internal attempt. Nothing here reads or writes Review cards, Review
 * logs, learning status, the streak, sense coverage or saved Material, and no provider is called.
 * The database refuses the retired Review-writing path on its own as well.
 */

export class PracticeConflict extends Error {}

export interface PracticeView {
  revision: number
  session: PracticeSessionState | null
  /** A session saved by the retired AI-enabled contract was closed rather than resumed. */
  retired: boolean
}

/** Returned instead of starting when saved Material cannot fill the chosen time. */
export interface PracticeShortfall {
  requestedMinutes: number
  /** Whole minutes of usable Practice; 0 when nothing safe can be built. */
  availableMinutes: number
}

/** The saved session. Only planning needs the attempt history, so only planning pays for it. */
export async function readPractice(supabase: SupabaseClient, userId: string, options: { history?: boolean } = {}): Promise<{ store: PracticeStore; attempts: PracticeAttempt[]; retired: boolean }> {
  const [state, history] = await Promise.all([
    supabase.from('practice_state').select('revision, session').eq('user_id', userId).maybeSingle(),
    options.history ? supabase.from('practice_attempts').select('payload').eq('user_id', userId).order('created_at', { ascending: false }).limit(2000) : { data: [], error: null },
  ])
  if (state.error || history.error) throw new Error('Practice unavailable')
  const raw: unknown = state.data || { revision: 0, session: null }
  if (!isRecord(raw) || !Number.isInteger(raw.revision) || Number(raw.revision) < 0) throw new Error('Practice data needs checking')
  let session: PracticeSessionState | null = null
  let retired = false
  if (isRecord(raw.session) && raw.session.version === 1) retired = true
  else if (raw.session !== null && raw.session !== undefined) {
    if (!isPracticeSession(raw.session)) throw new Error('Practice data needs checking')
    session = raw.session
  }
  const attempts = (history.data || []).map((row) => row.payload as unknown).filter(isPracticeAttempt).reverse()
  return { store: { revision: Number(raw.revision), session }, attempts, retired }
}

export async function practiceView(supabase: SupabaseClient, userId: string): Promise<PracticeView> {
  const { store, retired } = await readPractice(supabase, userId)
  return { revision: store.revision, session: store.session, retired }
}

/** Save the session (and an attempt), returning what the learner now sees. */
async function commit(supabase: SupabaseClient, store: PracticeStore, session: PracticeSessionState | null, attempt: Record<string, unknown> | null = null): Promise<PracticeView> {
  if (session !== null && !isPracticeSession(session)) throw new Error('Invalid practice state')
  // `next_objectives` and `legacy_change` are retired: the database ignores the first and refuses
  // any non-null value of the second. They are passed only because the routine keeps its signature.
  const { data, error } = await supabase.rpc('commit_practice', { expected_revision: store.revision, next_session: session, next_objectives: {}, attempt, legacy_change: null })
  if (error?.code === '40001') throw new PracticeConflict()
  if (error || !isRecord(data) || !Number.isInteger(data.revision) || (data.session !== null && !isPracticeSession(data.session))) throw new Error('Could not save practice')
  return { revision: Number(data.revision), session: data.session as PracticeSessionState | null, retired: false }
}

function viewOf(store: PracticeStore, retired: boolean): PracticeView {
  return { revision: store.revision, session: store.session, retired }
}

function isActive(session: PracticeSessionState | null): session is PracticeSessionState {
  return Boolean(session && !session.finished && (session.queue.length || session.current))
}

/**
 * Plan and save a session for the chosen minutes. An unfinished session is resumed instead, never
 * replanned. When saved Material cannot fill the time, nothing is saved and the shortfall is
 * returned so the learner can take the shorter session or go to Review.
 */
export async function startPractice(supabase: SupabaseClient, userId: string, input: { minutes: number; acceptShorter: boolean }): Promise<{ view: PracticeView; shortfall: PracticeShortfall | null }> {
  const [{ store, attempts, retired }, cards, profile] = await Promise.all([
    readPractice(supabase, userId, { history: true }),
    supabase.from('review_cards').select('*, vocabulary_entries(*)').eq('user_id', userId).order('due').limit(1000),
    supabase.from('profiles').select('default_translation_language').eq('id', userId).single(),
  ])
  if (isActive(store.session)) return { view: viewOf(store, retired), shortfall: null }
  if (cards.error || profile.error) throw new Error('Could not prepare practice')
  const now = new Date()
  const locale: unknown = profile.data?.default_translation_language
  if (!isTranslationLanguage(locale)) throw new Error('Invalid practice language')
  // Only the learner's own saved Material can become a target.
  const items = (cards.data || []).filter(isReviewSource).filter((item) => item.user_id === userId)
  const seed = crypto.randomUUID()
  let session = planPractice({ items, attempts, targetMinutes: input.minutes, seed, locale, now })
  const available = queueSeconds(session.queue)
  const unchanged = viewOf(store, retired)
  if (!session.queue.length) return { view: unchanged, shortfall: { requestedMinutes: input.minutes, availableMinutes: 0 } }
  if (available + NEAR_TARGET_SECONDS < input.minutes * 60) {
    const availableMinutes = Math.max(1, Math.floor(available / 60))
    if (!input.acceptShorter) return { view: unchanged, shortfall: { requestedMinutes: input.minutes, availableMinutes } }
    session = { ...session, targetMinutes: Math.min(input.minutes, availableMinutes) }
  }
  return { view: await commit(supabase, store, session), shortfall: null }
}

export async function actOnPractice(supabase: SupabaseClient, userId: string, input: PracticeActionInput): Promise<PracticeView> {
  const { store } = await readPractice(supabase, userId)
  if (store.revision !== input.revision) throw new PracticeConflict()
  const session = store.session
  const task = session?.queue[0]
  if (!session || session.finished || (task?.id || '') !== input.taskId) throw new PracticeConflict()
  const now = new Date()
  const elapsedSeconds = activeSeconds(session, now)
  const running = { ...session, elapsedSeconds, activeSince: now.toISOString() }

  if (input.action === 'finish') {
    return commit(supabase, store, { ...session, elapsedSeconds, activeSince: null, finished: true, queue: [], current: null, draft: null })
  }
  if (input.action === 'pause') {
    const draft = task && input.draft ? { taskId: task.id, answer: input.draft.answer, picked: input.draft.picked.filter((index) => index < (task.choices?.length || 0)) } : null
    return commit(supabase, store, { ...session, elapsedSeconds, activeSince: null, draft: draft && (draft.answer || draft.picked.length) ? draft : null })
  }
  if (input.action === 'resume') {
    // A stretch left running by a closed app is unknown time, so it is not counted.
    return commit(supabase, store, { ...session, activeSince: now.toISOString() })
  }
  if (!task) throw new PracticeConflict()
  const response: PracticeResponse = session.current || { answer: '', result: null, assistance: 'none', feedback: '', responseMs: 0, revealed: false, answeredAt: null }

  if (input.action === 'help') {
    if (response.revealed || isChoiceKind(task.kind)) throw new PracticeConflict()
    return commit(supabase, store, { ...running, current: { ...response, assistance: 'hint' } })
  }

  if (input.action === 'answer') {
    if (response.revealed) throw new PracticeConflict()
    const answer = input.answer.trim()
    if (isChoiceKind(task.kind) && answer && !isOfferedChoice(task, answer)) throw new PracticeConflict()
    // The target must still be a live sense of the learner's own saved entry, unchanged since the
    // plan was made. A deleted or edited entry drops out of the session rather than being graded
    // against content it no longer has.
    const { data: entry, error } = await supabase.from('vocabulary_entries').select('*').eq('id', task.entryId).eq('user_id', userId).maybeSingle()
    if (error) throw new Error('Could not check this entry')
    if (!entry || currentTaskContentVersion(entry, task) !== task.contentVersion) {
      return commit(supabase, store, { ...running, queue: session.queue.filter((item) => item.entryId !== task.entryId), current: null, draft: null })
    }
    const grade = gradePracticeAnswer(task, answer, response.assistance)
    return commit(supabase, store, { ...running, draft: null, current: { answer, ...grade, responseMs: input.responseMs, revealed: true, answeredAt: now.toISOString() } })
  }

  if (input.action === 'report') {
    if (!isReportable(task, response) || response.reported) throw new PracticeConflict()
    return commit(supabase, store, { ...running, current: { ...response, reported: true } })
  }

  // 'next': record the finished exercise as an internal attempt and move on.
  if (!response.revealed || response.result === null) throw new PracticeConflict()
  const attempt: PracticeAttempt = {
    id: crypto.randomUUID(), taskId: task.id, targetKey: task.targetKey, entryId: task.entryId, senseId: task.senseId,
    kind: task.kind, result: response.result, assistance: response.assistance, responseMs: response.responseMs,
    at: response.answeredAt || now.toISOString(), contentVersion: task.contentVersion, locale: session.locale, newTarget: task.newTarget,
    // A typed answer is kept only when the learner asked for it to be reviewed.
    ...(response.reported ? { reported: true, answer: response.answer } : {}),
  }
  // Near the target no new exercise starts; the one just answered was never cut off.
  const queue = targetReached(session, elapsedSeconds) ? [] : finishPracticeTask(session.queue, response, session.seed)
  return commit(supabase, store, {
    ...running, queue, current: null, draft: null, completed: session.completed + 1,
    activeSince: queue.length ? running.activeSince : null,
    attempts: [...session.attempts, attempt].slice(-500),
  }, { ...attempt, sessionId: session.id })
}
