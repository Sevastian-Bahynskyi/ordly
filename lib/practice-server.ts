import type { SupabaseClient } from '@supabase/supabase-js'
import { checkAnswer, matchingSenseIds } from './answer'
import { planPractice, introducedPracticeTargets, newSenseObjectives } from './practice-planner'
import { countsForSchedule, finishPracticeTask, isChoiceKind, legacyEvidence, practiceStudyDate, summarizePractice, type PracticeAttempt, type PracticeRating, type PracticeResponse, type PracticeSessionState, type PracticeStore, type PracticeTask } from './practice'
import { isPracticeAttempt, isPracticeStore, isReviewSource } from './practice-validation'
import { schedulePractice } from './practice-schedule'
import { gradePractice } from './practice-ai'
import { generateMemoryPack, generateSenseExample, parseMemoryPack, parseSenseExample } from './practice-pack'
import { currentTaskContentVersion } from './practice-content'
import { isSenseTargetKey, itemSenses } from './practice-senses'
import { sentenceTiles } from './practice-exercises'
import { activeSenses, createSense, entrySenses, normalizeSenseText, parseSenses, splitTranslationIntoSenses } from './senses'
import type { EntrySense, ReviewItem, TranslationLanguage } from './types'

export class PracticeConflict extends Error {}

/**
 * Shared per-session ceiling on provider calls. Grading and coaching both spend from it, but only
 * coaching is gated by the learner's AI toggle (D5) — see the `'answer'` handler.
 */
export const PRACTICE_AI_CALL_BUDGET = 12

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
  const previous = store.session && !store.session.finished ? store.session : null
  const plan = (source: ReviewItem[]): PracticeSessionState =>
    planPractice({ items: source, store, attempts, introducedToday: introduced.size, dailyLimit, language, aiEnabled: previous?.aiEnabled ?? aiEnabled, now, links: [] })
  let planned = plan(items)
  // D10: a meaning gets its example sentence the moment it first becomes an objective. Replanning
  // with the filled-in example lets the newly promoted sense start on a real interactive board
  // instead of the bare typed fallback.
  if (await fillSenseExamples(supabase, userId, planned, items, language)) planned = plan(items)
  const session = previous ? { ...previous, queue: planned.queue, current: null } : planned
  await commit(supabase, store, { ...store, session })
}

/**
 * Generate the missing example for each sense this plan is newly admitting, and store it on the
 * sense itself (D10). Returns whether anything changed.
 *
 * Three deliberate restraints: the primary sense is skipped because it reads the entry's own
 * `example_sentence` columns; an existing example is never overwritten, only a null one filled, so
 * the "generated aids never overwrite vocabulary fields" rule still holds; and the write is
 * conditional on `updated_at`, so an edit made in the entry editor between the read and the write
 * simply wins. Promotion is capped at one sense per session, so this is at most one provider call.
 */
async function fillSenseExamples(supabase: SupabaseClient, userId: string, session: PracticeSessionState, items: ReviewItem[], language: TranslationLanguage): Promise<boolean> {
  let changed = false
  for (const task of newSenseObjectives(session)) {
    const item = items.find((candidate) => candidate.entry_id === task.entryId)
    if (!item) continue
    const senses = itemSenses(item)
    const index = senses.findIndex((sense) => sense.id === task.senseId)
    if (index <= 0 || senses[index].example) continue
    const sense = senses[index]
    const entry = item.vocabulary_entries
    const cacheKey = `sense-example-v1:${task.targetKey}:${task.contentVersion}:${language}`
    const { data: cached } = await supabase.from('practice_packs').select('payload').eq('user_id', userId).eq('cache_key', cacheKey).maybeSingle()
    let pack = parseSenseExample(cached?.payload, entry.danish)
    if (!pack) {
      pack = await generateSenseExample(entry.danish, { text: sense.text, pos: sense.pos }, language)
      if (pack) await supabase.from('practice_packs').insert({ user_id: userId, cache_key: cacheKey, payload: pack })
    }
    if (!pack) continue
    // Patch only this sense, on the row as we read it, leaving every text untouched so the sync
    // trigger recomputes an identical `translation` and no in-flight task is invalidated.
    const stored = parseSenses(entry.senses)
    const next = stored.map((candidate) => candidate.id === sense.id && !candidate.example
      ? { ...candidate, example: pack.example, example_translation: pack.translation }
      : candidate)
    const { error } = await supabase.from('vocabulary_entries').update({ senses: next }).eq('id', entry.id).eq('user_id', userId).eq('updated_at', entry.updated_at)
    if (error) continue
    entry.senses = next
    changed = true
  }
  return changed
}

/**
 * The assistance a revealed answer carries. A tapped board is `'choices'`, but an already
 * escalated hint or model reveal stays as it is: those are stricter, because they stop the
 * objective advancing at all.
 */
function choiceAssistance(task: PracticeTask, response: PracticeResponse, answer: string, spoken: boolean): PracticeResponse['assistance'] {
  if (!answer && !spoken) return 'model'
  if (response.assistance !== 'none') return response.assistance
  return isChoiceKind(task.kind) ? 'choices' : 'none'
}

/**
 * A tapped answer has to be one of the offered options. Without this the client could post free
 * text and collect `'choices'` assistance for it, which is a grading claim the board never made.
 */
function isOfferedChoice(task: PracticeTask, answer: string): boolean {
  const choices = task.choices || []
  if (!choices.length) return false
  if (task.kind !== 'assemble') return choices.includes(answer)
  const bank = [...choices]
  for (const tile of sentenceTiles(answer)) {
    const at = bank.indexOf(tile)
    if (at < 0) return false
    bank.splice(at, 1)
  }
  return true
}

/**
 * Coverage for one rated exposure (D9, D18), written atomically by `record_sense_coverage`.
 *
 * A sense task always stamps `last_seen` on its own sense; a success counts as `recognized` when it
 * was tapped and `produced` only when it was unaided. A typed meaning recall credits exactly the
 * senses the answer named. Coverage is bookkeeping for the planner, so a failed write is dropped
 * rather than failing a rating the learner has already committed.
 */
async function recordCoverage(supabase: SupabaseClient, task: PracticeTask, response: PracticeResponse, rating: PracticeRating | null, entry: Record<string, unknown> | null): Promise<void> {
  if (!task.entryId || !entry || rating === null) return
  const success = rating > 1 && (response.result === 'correct' || response.result === 'mostly')
  let senseIds: string[] = []
  let outcome: 'seen' | 'recognized' | 'produced' = 'seen'
  if (task.senseId) {
    senseIds = [task.senseId]
    if (success && response.assistance === 'choices') outcome = 'recognized'
    else if (success && response.assistance === 'none') outcome = 'produced'
  } else if (task.kind === 'recall' && success) {
    senseIds = matchingSenseIds(response.answer, activeSenses(parseSenses(entry.senses)))
    outcome = 'recognized'
  }
  if (!senseIds.length) return
  await supabase.rpc('record_sense_coverage', { target_entry_id: task.entryId, sense_ids: senseIds, outcome })
}

/**
 * `My answer was right` in practice (D5, §4). Only a typed meaning recall qualifies: there the
 * answer is a meaning, which is what a sense is. The verdict flips to correct and the answer is
 * appended as a `source: 'user'` sense, so the deterministic checker accepts it next time. The
 * learner still chooses the FSRS rating.
 *
 * A sentence keeps exactly one sense (plan §3.2), so for a sentence only the verdict flips.
 * The write is conditional on `updated_at`: an edit made meanwhile in the entry editor wins.
 */
async function acceptAnswer(supabase: SupabaseClient, userId: string, task: PracticeTask, response: PracticeResponse, entry: Record<string, unknown>): Promise<void> {
  const typed = response.answer.trim()
  const typedKey = normalizeSenseText(typed)
  if (!typedKey || entry.entry_kind === 'sentence') return
  const stored = parseSenses(entry.senses)
  const base = stored.length ? stored : splitTranslationIntoSenses(typeof entry.translation === 'string' ? entry.translation : null, 'word')
  if (activeSenses(base).some((sense) => normalizeSenseText(sense.text) === typedKey)) return
  const { data, error } = await supabase.from('vocabulary_entries')
    .update({ senses: [...base, createSense(typed, { source: 'user' })] })
    .eq('id', task.entryId).eq('user_id', userId).eq('updated_at', String(entry.updated_at))
    .select('id')
  if (error || !data?.length) throw new PracticeConflict()
}

export interface PracticeAction {
  action: 'answer' | 'help' | 'rate' | 'accept' | 'pause' | 'repair' | 'finish'
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
  if (!session || session.finished || (task?.id || '') !== input.taskId) throw new PracticeConflict()
  const now = new Date()
  const elapsedSeconds = Math.max(session.elapsedSeconds, Math.min(input.elapsedSeconds, session.elapsedSeconds + 3600))
  const response: PracticeResponse = session.current || { answer: '', result: 'ungraded', assistance: 'none', feedback: '', communication: 'uncertain', target: 'uncertain', modality: 'typed', responseMs: 0, replays: 0, revealed: false, answeredAt: null }
  let nextSession = { ...session, elapsedSeconds }
  if (input.action === 'pause') {
    await commit(supabase, store, { ...store, session: nextSession })
    return
  }
  if (input.action === 'finish') {
    await commit(supabase, store, { ...store, session: { ...nextSession, finished: true, queue: [], current: null } })
    return
  }
  if (!task) throw new PracticeConflict()
  let entry: Record<string, unknown> | null = null
  if (task.entryId) {
    const { data, error } = await supabase.from('vocabulary_entries').select('*').eq('id', task.entryId).eq('user_id', userId).maybeSingle()
    if (error) throw new Error('Could not check this entry')
    if (!data || currentTaskContentVersion(data, task) !== task.contentVersion) {
      const queue = session.queue.filter((item) => item.entryId !== task.entryId)
      await commit(supabase, store, { ...store, session: { ...nextSession, queue, current: null } })
      return
    }
    entry = data
  }
  if (input.action === 'repair') {
    if (!response.revealed || !session.aiEnabled || session.aiCalls >= PRACTICE_AI_CALL_BUDGET) throw new PracticeConflict()
    const { data: profile } = await supabase.from('profiles').select('default_translation_language').eq('id', userId).single()
    const language = String(profile?.default_translation_language || 'ru')
    const cacheKey = `memory-v2:${task.targetKey}:${task.contentVersion}:${language}`
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
    const queue = [{ ...task, source: 'ai' as const, hint: pack.hint, example: `${pack.example}\n${pack.translation}\n\n${pack.secondExample}\n${pack.secondTranslation}` }, ...nextSession.queue.slice(1)]
    await commit(supabase, store, { ...store, session: { ...nextSession, queue } })
    return
  }
  if (input.action === 'accept') {
    if (!response.revealed || task.kind !== 'recall' || !entry || response.modality !== 'typed' || !response.answer.trim() || response.result === 'correct') throw new PracticeConflict()
    await acceptAnswer(supabase, userId, task, response, entry)
    nextSession.current = { ...response, result: 'correct', communication: 'yes', target: 'yes', feedback: 'Accepted. This meaning now counts as correct for this word.' }
    await commit(supabase, store, { ...store, session: nextSession })
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
    const choiceKind = isChoiceKind(task.kind)
    const spoken = input.modality === 'spoken' && !choiceKind
    // A tapped board is graded by construction: the option either is the answer or is not, so no
    // provider call is ever needed, and the client may only submit options the board offered.
    if (choiceKind && answer && !isOfferedChoice(task, answer)) throw new PracticeConflict()
    // Only meaning recall may accept another sense: for a production task the expected answer is
    // the Danish, and a meaning in the learner's own language must never satisfy it (D5).
    const recall = !choiceKind && task.kind === 'recall'
    const options = { sentence: choiceKind || task.kind !== 'recall' || task.answerIsSentence, meaning: task.kind === 'recall', senses: recall ? entrySenses(entry || {}) : null }
    let result = answer && !spoken ? checkAnswer(answer, task.answer, options) : 'incorrect'
    // The saved base form typed into a gap that needs an inflected one is the right word, wrong form.
    const baseFormInGap = task.kind === 'cloze' && result === 'incorrect' && Boolean(answer) && checkAnswer(answer, task.danish.replace(/^at\s+/iu, ''), { sentence: true }) !== 'incorrect'
    if (baseFormInGap) result = 'mostly'
    const message = spoken ? 'Compare what you said with the example. Choose your own recall rating.'
      : !answer ? 'Read the answer, connect it to a situation, then try again later.'
        : baseFormInGap ? `Right word. This sentence needs the form “${task.answer}”.`
          : result === 'incorrect' ? (choiceKind ? 'Not this one. Read the answer below.' : task.kind === 'cloze' ? 'Not this word. Compare with the missing word below.' : 'Needs checking. Compare your answer with the example and choose your own rating.')
            : result === 'mostly' ? 'Almost. Check the highlighted letters.'
              : choiceKind ? 'Correct. You picked it from the options, so this counts as supported practice.' : task.kind === 'recall' ? 'Meaning recalled. Your wording is accepted.' : 'Correct.'
    let feedback: { result: PracticeResponse['result']; feedback: string; communication: PracticeResponse['communication']; target: PracticeResponse['target']; relation: NonNullable<PracticeResponse['relation']>; correction?: string } = {
      result: spoken ? 'ungraded' : result,
      feedback: message,
      communication: result === 'correct' ? 'yes' : 'uncertain',
      target: result === 'correct' ? 'yes' : 'uncertain',
      relation: baseFormInGap ? 'grammar_adjustment' : result === 'correct' ? 'exact' : 'incorrect',
    }
    // A failed typed answer may be a valid contextual replacement. The semantic checker can
    // distinguish that from a word that needs a different grammatical construction.
    if (answer && !spoken && !choiceKind && result === 'incorrect') {
      feedback.result = 'ungraded'
      // D5: grading is not coaching. A learner who turned AI feedback off still deserves to have
      // a correct synonym recognised, so the call is permitted either way — the toggle now only
      // decides whether the model's prose is shown. The shared call budget still applies.
      if (session.aiCalls < PRACTICE_AI_CALL_BUDGET) {
        // Reserve the call before contacting the provider, preventing concurrent retries from overspending.
        const reserved = await commit(supabase, store, { ...store, session: { ...nextSession, aiCalls: session.aiCalls + 1 } })
        const { data: profile } = await supabase.from('profiles').select('default_translation_language').eq('id', userId).single()
        const checked = await gradePractice(task, answer, String(profile?.default_translation_language || 'ru'))
        // The correction is shown either way: it is the grading result, not coaching prose.
        if (checked) feedback = session.aiEnabled ? checked : { ...checked, feedback: feedback.feedback }
        Object.assign(store, reserved)
        nextSession = { ...reserved.session!, elapsedSeconds }
      }
    }
    nextSession.current = { ...response, ...feedback, answer, modality: spoken ? 'spoken' : 'typed', responseMs: input.responseMs, replays: input.replays, revealed: true, answeredAt: now.toISOString(), assistance: choiceAssistance(task, response, answer, spoken) }
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
    // D14: `legacyEvidence` is the only door to `review_cards` / `review_logs` / mastery, and a
    // `'choices'` answer never gets through it — not even on Again.
    if (legacyEvidence(task, finalResponse) && task.cardId) {
      const { data: card, error } = await supabase.from('review_cards').select('*').eq('id', task.cardId).eq('user_id', userId).single()
      if (error || !card) throw new PracticeConflict()
      if (card.last_review && Date.parse(card.last_review) > Date.parse(answeredAt)) {
        await commit(supabase, store, { ...store, session: { ...nextSession, current: null, queue: nextSession.queue.filter((item) => item.cardId !== task.cardId) } })
        return
      }
      const scheduled = schedulePractice({ ...card, last_review: card.last_review || undefined }, rating, new Date(answeredAt))
      legacyChange = { id: card.id, expectedReps: card.reps, expectedLastReview: card.last_review, card: scheduled }
    } else if (task.objective === 'production' || isSenseTargetKey(task.targetKey)) {
      const previous = objectives[task.targetKey]
      const card = previous?.task.contentVersion === task.contentVersion ? previous.card : null
      objectives[task.targetKey] = { task: { ...task, newTarget: false, retry: 0 }, card: schedulePractice(card, rating, new Date(answeredAt)) }
    }
  }
  const needsTargetRetry = task.objective === 'production' && finalResponse.target === 'no'
  const queue = finishPracticeTask(session.queue, needsTargetRetry ? 1 : rating, finalResponse.assistance)
  nextSession = { ...nextSession, queue, current: null, attempts: [...session.attempts, attempt].slice(-500), completed: session.completed + (queue.some((item) => item.targetKey === task.targetKey && item.kind === task.kind && item.retry > task.retry) ? 0 : 1) }
  await commit(supabase, store, { ...store, session: nextSession, objectives }, { ...attempt, sessionId: session.id, entryId: task.entryId }, legacyChange)
  await recordCoverage(supabase, task, finalResponse, rating, entry)
}
