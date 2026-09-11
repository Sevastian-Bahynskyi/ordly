import { entryContentVersion, frameTasks, selectFrame, vocabularyTask } from './practice-content'
import { newTargetBudget, practiceStudyDate, type PracticeAttempt, type PracticeSessionState, type PracticeStore, type PracticeTask } from './practice'
import type { ReviewItem, TranslationLanguage } from './types'

export function planPractice(input: {
  items: ReviewItem[]; store: PracticeStore; attempts: PracticeAttempt[]; introducedToday: number;
  dailyLimit: number; language: TranslationLanguage; aiEnabled: boolean; now: Date
}): PracticeSessionState {
  const { items, store, attempts, now } = input
  const known = items.filter((item) => item.reps > 0 && item.vocabulary_entries.translation)
  const due = known.filter((item) => Date.parse(item.due) <= now.getTime())
  const recent = attempts.filter((a) => a.assistance === 'none' && a.result !== 'ungraded' && a.objective !== null && a.kind !== 'teach').slice(-20).map((a) => a.result !== 'incorrect' && a.rating !== 1)
  let budget = newTargetBudget({ dailyLimit: input.dailyLimit, introducedToday: input.introducedToday, dueCount: due.length, recent })
  const production = Object.values(store.objectives).filter((objective) => Date.parse(objective.card.due) <= now.getTime())
    .filter((objective) => !objective.task.entryId || known.some((item) => item.entry_id === objective.task.entryId && entryContentVersion(item.vocabulary_entries) === objective.task.contentVersion))
    .sort((a, b) => Date.parse(a.card.due) - Date.parse(b.card.due)).slice(0, 3)
  const diagnostics = attempts.length === 0 ? known.filter((item) => !production.some((objective) => objective.task.targetKey === item.entry_id)).slice(0, 3).map((item) => vocabularyTask(item, 'production')) : []
  const used = new Set([...production.map((objective) => objective.task.targetKey), ...diagnostics.map((task) => task.targetKey)])
  const queue: PracticeTask[] = due.filter((item) => !used.has(item.entry_id)).slice(0, due.length > 16 ? 10 : 6).map((item) => vocabularyTask(item, 'meaning'))
  queue.splice(Math.min(2, queue.length), 0, ...production.map((objective) => ({ ...objective.task, newTarget: false, retry: 0, stage: 'remember' as const })))
  queue.unshift(...diagnostics)
  const day = Math.floor(now.getTime() / 86400000)
  const frame = selectFrame(attempts, budget > 0, day)
  if (frame?.introduction) budget -= 1
  for (const item of items.filter((item) => item.reps === 0 && item.vocabulary_entries.translation).slice(0, budget)) {
    const task = vocabularyTask(item, 'meaning')
    queue.push({ ...task, id: `${task.id}:teach`, kind: 'teach', stage: 'learn' })
    queue.push({ ...task, newTarget: false, stage: 'return' })
  }
  if (frame) {
    const tasks = frameTasks(frame.frame, input.language, frame.introduction, day)
    // Scheduled production above already tested this frame without first exposing it.
    queue.push(...tasks.filter((task) => task.kind !== 'produce' || !used.has(task.targetKey)))
  }
  const active = known.find((item) => !used.has(item.entry_id) && (!store.objectives[item.entry_id] || store.objectives[item.entry_id].task.contentVersion !== entryContentVersion(item.vocabulary_entries)))
  if (active && !diagnostics.length) queue.push({ ...vocabularyTask(active, 'production'), stage: 'return', newTarget: false })
  return { version: 1, id: crypto.randomUUID(), queue, attempts: [], completed: 0, elapsedSeconds: 0, createdAt: now.toISOString(), aiEnabled: input.aiEnabled, aiCalls: 0, current: null }
}

export function introducedPracticeTargets(attempts: PracticeAttempt[], now: Date): Set<string> {
  return new Set(attempts.filter((a) => a.newTarget && practiceStudyDate(new Date(a.at)) === practiceStudyDate(now)).map((a) => a.targetKey))
}
