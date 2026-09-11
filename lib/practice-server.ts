import type { SupabaseClient } from '@supabase/supabase-js'
import { checkAnswer } from './answer'
import { planPractice, introducedPracticeTargets } from './practice-planner'
import { countsForSchedule, finishPracticeTask, practiceStudyDate, summarizePractice, type PracticeAttempt, type PracticeRating, type PracticeResponse, type PracticeStore } from './practice'
import { isPracticeAttempt, isPracticeStore, isReviewSource } from './practice-validation'
import { schedulePractice } from './practice-schedule'
import { gradePractice } from './practice-ai'
import { generateMemoryPack, parseMemoryPack } from './practice-pack'
import { entryContentVersion } from './practice-content'

export class PracticeConflict extends Error {}

export async function readPractice(supabase: SupabaseClient, userId: string): Promise<{ store: PracticeStore; attempts: PracticeAttempt[] }> {
  const [state, history] = await Promise.all([
    supabase.from('practice_state').select('revision, session, objectives').eq('user_id', userId).maybeSingle(),
    supabase.from('practice_attempts').select('payload').eq('user_id', userId).order('created_at', { ascending: false }).limit(2000),
  ])
  if (state.error || history.error) throw new Error('Practice unavailable')
  const store: unknown = state.data || { revision: 0, session: null, objectives: {} }
  if (!isPracticeStore(store)) throw new Error('Practice data needs checking')
  const attempts = (history.data || []).map((row) => row.payload as unknown).filter(isPracticeAttempt).reverse()
  return { store, attempts }
}

export async function practiceView(supabase: SupabaseClient, userId: string): Promise<{ revision: number; session: PracticeStore['session']; summary: ReturnType<typeof summarizePractice> }> {
  const { store, attempts } = await readPractice(supabase, userId)
  return { revision: store.revision, session: store.session, summary: summarizePractice(attempts) }
}

async function commit(supabase: SupabaseClient, previous: PracticeStore, next: PracticeStore, attempt: Record<string, unknown> | null = null, legacyChange: Record<string, unknown> | null = null): Promise<PracticeStore> {
  if (!isPracticeStore(next)) throw new Error('Invalid practice state')
  const { data, error } = await supabase.rpc('commit_practice', { expected_revision: previous.revision, next_session: next.session, next_objectives: next.objectives, attempt, legacy_change: legacyChange })
  if (error?.code === '40001') throw new PracticeConflict()
  if (error || !isPracticeStore(data)) throw new Error('Could not save practice')
  return data
}

export async function startPractice(supabase: SupabaseClient, userId: string, aiEnabled: boolean): Promise<void> {
  const { store, attempts } = await readPractice(supabase, userId)
  if (store.session?.queue.length) return
  const now = new Date()
  const [cards, profile, newLogs] = await Promise.all([
    supabase.from('review_cards').select('*, vocabulary_entries(*)').eq('user_id', userId).order('due').limit(1000),
    supabase.from('profiles').select('daily_new_limit, default_translation_language').eq('id', userId).single(),
    supabase.from('review_logs').select('entry_id').eq('user_id', userId).eq('study_date', practiceStudyDate(now)).eq('previous_state', 0),
  ])
  if (cards.error || profile.error || newLogs.error) throw new Error('Could not prepare practice')
  const introduced = introducedPracticeTargets(attempts, now)
  for (const log of newLogs.data || []) introduced.add(log.entry_id)
  const items = (cards.data || []).filter(isReviewSource)
  const language: unknown = profile.data.default_translation_language
  if (language !== 'ru' && language !== 'en' && language !== 'uk') throw new Error('Invalid practice language')
  const dailyLimit: unknown = profile.data.daily_new_limit
  if (typeof dailyLimit !== 'number' || !Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 50) throw new Error('Invalid practice limit')
  const session = planPractice({ items, store, attempts, introducedToday: introduced.size, dailyLimit, language, aiEnabled, now })
  await commit(supabase, store, { ...store, session })
}

export interface PracticeAction {
  action: 'answer' | 'help' | 'rate' | 'pause' | 'repair'
  revision: number
  taskId: string
  answer?: string
  rating?: PracticeRating | null
  help?: 'hint' | 'transcript'
  modality?: 'typed' | 'spoken'
  responseMs: number
  replays: number
  elapsedSeconds: number
}

export async function actOnPractice(supabase: SupabaseClient, userId: string, input: PracticeAction): Promise<void> {
  const { store, attempts } = await readPractice(supabase, userId)
  if (store.revision !== input.revision) throw new PracticeConflict()
  const session = store.session
  const task = session?.queue[0]
  if (!session || !task || task.id !== input.taskId) throw new PracticeConflict()
  const now = new Date()
  const elapsedSeconds = Math.max(session.elapsedSeconds, Math.min(input.elapsedSeconds, session.elapsedSeconds + 3600))
  const response: PracticeResponse = session.current || { answer: '', result: 'ungraded', assistance: 'none', feedback: '', communication: 'uncertain', target: 'uncertain', modality: 'typed', responseMs: 0, replays: 0, revealed: false, answeredAt: null }
  let nextSession = { ...session, elapsedSeconds }
  if (input.action === 'pause') {
    await commit(supabase, store, { ...store, session: nextSession })
    return
  }
  if (task.entryId) {
    const { data: entry, error } = await supabase.from('vocabulary_entries').select('*').eq('id', task.entryId).eq('user_id', userId).maybeSingle()
    if (error) throw new Error('Could not check this entry')
    if (!entry || entryContentVersion(entry) !== task.contentVersion) {
      const queue = session.queue.filter((item) => item.entryId !== task.entryId)
      await commit(supabase, store, { ...store, session: { ...nextSession, queue, current: null } })
      return
    }
  }
  if (input.action === 'repair') {
    if (!response.revealed || !session.aiEnabled || session.aiCalls >= 12) throw new PracticeConflict()
    const { data: profile } = await supabase.from('profiles').select('default_translation_language').eq('id', userId).single()
    const language = String(profile?.default_translation_language || 'ru')
    const cacheKey = `memory-v1:${task.targetKey}:${task.contentVersion}:${language}`
    const { data: cached } = await supabase.from('practice_packs').select('payload').eq('user_id', userId).eq('cache_key', cacheKey).maybeSingle()
    let pack = parseMemoryPack(cached?.payload, task.danish)
    if (!pack) {
      const reserved = await commit(supabase, store, { ...store, session: { ...nextSession, aiCalls: session.aiCalls + 1 } })
      Object.assign(store, reserved)
      nextSession = { ...reserved.session!, elapsedSeconds }
      const familiar = Object.values(store.objectives).filter((objective) => objective.card.reps >= 3 && objective.card.stability >= 7).slice(0, 30).map((objective) => objective.task.danish)
      pack = await generateMemoryPack(task, language, familiar)
      if (pack) await supabase.from('practice_packs').insert({ user_id: userId, cache_key: cacheKey, payload: pack })
    }
    if (!pack) throw new Error('Memory aid unavailable')
    const queue = [{ ...task, source: 'ai' as const, hint: pack.hint, example: `${pack.example}\n${pack.translation}` }, ...nextSession.queue.slice(1)]
    await commit(supabase, store, { ...store, session: { ...nextSession, queue } })
    return
  }
  if (input.action === 'help') {
    if (response.revealed) return
    nextSession.current = { ...response, assistance: response.assistance === 'model' ? 'model' : input.help || 'hint', replays: input.replays }
    await commit(supabase, store, { ...store, session: nextSession })
    return
  }
  if (input.action === 'answer') {
    if (response.revealed) return
    const answer = input.answer?.trim() || ''
    const spoken = input.modality === 'spoken'
    const result = answer && !spoken ? checkAnswer(answer, task.answer, { sentence: task.kind !== 'recall' || task.answerIsSentence }) : 'incorrect'
    let feedback = { result: (spoken ? 'ungraded' : result) as PracticeResponse['result'], feedback: spoken ? 'Compare what you said with the example. Choose your own recall rating.' : !answer ? 'Read the answer, connect it to a situation, then try again later.' : result === 'incorrect' ? 'Needs checking. Compare your meaning with the example and choose your own rating.' : 'Meaning recalled. Notice the Danish form.', communication: (result === 'correct' ? 'yes' : 'uncertain') as PracticeResponse['communication'], target: (result === 'correct' ? 'yes' : 'uncertain') as PracticeResponse['target'] }
    if (answer && !spoken && result === 'incorrect') {
      feedback.result = 'ungraded'
      if (session.aiEnabled && session.aiCalls < 12) {
        // Reserve the call before contacting the provider, preventing concurrent retries from overspending.
        const reserved = await commit(supabase, store, { ...store, session: { ...nextSession, aiCalls: session.aiCalls + 1 } })
        const { data: profile } = await supabase.from('profiles').select('default_translation_language').eq('id', userId).single()
        const checked = await gradePractice(task, answer, String(profile?.default_translation_language || 'ru'))
        if (checked) feedback = checked
        Object.assign(store, reserved)
        nextSession = { ...reserved.session!, elapsedSeconds }
      }
    }
    nextSession.current = { ...response, ...feedback, answer, modality: spoken ? 'spoken' : 'typed', responseMs: input.responseMs, replays: input.replays, revealed: true, answeredAt: now.toISOString(), assistance: !answer && !spoken ? 'model' : response.assistance }
    await commit(supabase, store, { ...store, session: nextSession })
    return
  }
  if (input.action !== 'rate' || (!response.revealed && task.kind !== 'teach')) throw new PracticeConflict()
  const rating = task.kind === 'teach' ? null : input.rating ?? null
  const finalResponse: PracticeResponse = task.kind === 'teach' ? { ...response, assistance: 'model', revealed: true } : response
  const previousAttempt = [...attempts].reverse().find((a) => a.targetKey === task.targetKey)
  let lastExposureAt = previousAttempt?.exposedAt || previousAttempt?.at || null
  if (task.entryId) {
    const { data: legacy, error } = await supabase.from('review_cards').select('last_review').eq('entry_id', task.entryId).eq('user_id', userId).maybeSingle()
    if (error) throw new Error('Could not read review evidence')
    if (legacy?.last_review && (!lastExposureAt || Date.parse(legacy.last_review) > Date.parse(lastExposureAt))) lastExposureAt = legacy.last_review
  }
  const answeredAt = finalResponse.answeredAt || now.toISOString()
  const attempt: PracticeAttempt = { id: crypto.randomUUID(), taskId: task.id, targetKey: task.targetKey, objective: task.objective, kind: task.kind, result: finalResponse.result, rating, assistance: finalResponse.assistance, modality: finalResponse.modality, responseMs: finalResponse.responseMs, at: answeredAt, exposedAt: now.toISOString(), lastExposureAt, replays: finalResponse.replays, newTarget: task.newTarget, promptVersion: 1, contentVersion: task.contentVersion, communication: finalResponse.communication, targetUse: finalResponse.target }
  const objectives = { ...store.objectives }
  let legacyChange: Record<string, unknown> | null = null
  if (countsForSchedule(task, finalResponse, rating) && rating !== null) {
    if (task.cardId) {
      const { data: card, error } = await supabase.from('review_cards').select('*').eq('id', task.cardId).eq('user_id', userId).single()
      if (error || !card) throw new PracticeConflict()
      if (card.last_review && Date.parse(card.last_review) > Date.parse(answeredAt)) {
        await commit(supabase, store, { ...store, session: { ...nextSession, current: null, queue: nextSession.queue.filter((item) => item.cardId !== task.cardId) } })
        return
      }
      const scheduled = schedulePractice({ ...card, last_review: card.last_review || undefined }, rating, new Date(answeredAt))
      legacyChange = { id: card.id, expectedReps: card.reps, expectedLastReview: card.last_review, card: scheduled }
    } else if (task.objective === 'production') {
      const previous = objectives[task.targetKey]
      const card = previous?.task.contentVersion === task.contentVersion ? previous.card : null
      objectives[task.targetKey] = { task: { ...task, newTarget: false, retry: 0 }, card: schedulePractice(card, rating, new Date(answeredAt)) }
    }
  }
  const needsTargetRetry = task.objective === 'production' && finalResponse.target === 'no'
  const queue = finishPracticeTask(session.queue, needsTargetRetry ? 1 : rating, finalResponse.assistance)
  nextSession = { ...nextSession, queue, current: null, attempts: [...session.attempts, attempt].slice(-500), completed: session.completed + (queue.some((item) => item.targetKey === task.targetKey && item.kind === task.kind && item.retry > task.retry) ? 0 : 1) }
  await commit(supabase, store, { ...store, session: nextSession, objectives }, { ...attempt, sessionId: session.id, entryId: task.entryId }, legacyChange)
}
