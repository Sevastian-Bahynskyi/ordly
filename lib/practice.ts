export type PracticeKind = 'recall' | 'produce' | 'teach' | 'build' | 'listen' | 'dialogue'
export type PracticeObjective = 'meaning' | 'production'
export type PracticeAssistance = 'none' | 'hint' | 'model' | 'transcript'
export type PracticeResult = 'correct' | 'mostly' | 'incorrect' | 'ungraded'
export type PracticeRating = 1 | 2 | 3 | 4

export interface PracticeTask {
  id: string
  targetKey: string
  entryId: string | null
  objective: PracticeObjective | null
  kind: PracticeKind
  stage: 'remember' | 'learn' | 'build' | 'speak' | 'return'
  prompt: string
  answer: string
  danish: string
  translation: string
  hint: string
  example: string
  audioText: string | null
  source: 'saved' | 'frame' | 'ai'
  newTarget: boolean
  retry: number
  answerIsSentence?: boolean
  cardId?: string
  contentVersion?: string
}

export interface PracticeAttempt {
  id: string
  taskId: string
  targetKey: string
  objective: PracticeObjective | null
  kind: PracticeKind
  result: PracticeResult
  rating: PracticeRating | null
  assistance: PracticeAssistance
  modality: 'typed' | 'spoken'
  responseMs: number
  at: string
  exposedAt?: string
  lastExposureAt: string | null
  replays: number
  newTarget?: boolean
  promptVersion?: number
  contentVersion?: string
  communication?: PracticeResponse['communication']
  targetUse?: PracticeResponse['target']
}

export interface PracticeSessionState {
  version: 1
  id: string
  queue: PracticeTask[]
  attempts: PracticeAttempt[]
  completed: number
  elapsedSeconds: number
  createdAt: string
  aiEnabled: boolean
  aiCalls: number
  current: PracticeResponse | null
}

export interface PracticeResponse {
  answer: string
  result: PracticeResult
  assistance: PracticeAssistance
  feedback: string
  communication: 'yes' | 'no' | 'uncertain'
  target: 'yes' | 'no' | 'uncertain'
  modality: 'typed' | 'spoken'
  responseMs: number
  replays: number
  revealed: boolean
  answeredAt: string | null
}

export interface PracticeSchedule {
  due: string
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  state: number
  last_review?: string
}

export interface ProductionObjective {
  task: PracticeTask
  card: PracticeSchedule
}

export interface PracticeStore {
  revision: number
  session: PracticeSessionState | null
  objectives: Record<string, ProductionObjective>
}

export interface PracticeSummary {
  meaning: { correct: number; total: number }
  production: { correct: number; total: number }
  listening: { correct: number; total: number }
  supported: number
}

export function summarizePractice(attempts: PracticeAttempt[]): PracticeSummary {
  const summary: PracticeSummary = { meaning: { correct: 0, total: 0 }, production: { correct: 0, total: 0 }, listening: { correct: 0, total: 0 }, supported: 0 }
  for (const attempt of attempts) {
    if (attempt.assistance !== 'none') { summary.supported += 1; continue }
    const delay = attempt.lastExposureAt ? Date.parse(attempt.at) - Date.parse(attempt.lastExposureAt) : NaN
    if (attempt.result === 'ungraded' || attempt.modality !== 'typed' || !Number.isFinite(delay) || delay < 86_400_000) continue
    const score = attempt.kind === 'listen' ? summary.listening : attempt.objective ? summary[attempt.objective] : null
    if (score) {
      score.total += 1
      if (attempt.rating !== 1 && (attempt.result === 'correct' || attempt.result === 'mostly')) score.correct += 1
    }
  }
  return summary
}

export function practiceStudyDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

export function countsForSchedule(task: PracticeTask, response: PracticeResponse, rating: PracticeRating | null): boolean {
  if (task.kind === 'teach' || task.objective === null || rating === null) return false
  if (rating === 1) return true
  if (response.assistance !== 'none') return false
  return task.objective !== 'production' || response.target !== 'no'
}

export function newTargetBudget(input: { dailyLimit: number; introducedToday: number; dueCount: number; recent: boolean[] }): number {
  const recent = input.recent.slice(-20)
  if (input.dueCount > 16 || (recent.length === 20 && recent.filter(Boolean).length < 15)) return 0
  return Math.max(0, Math.min(2, input.dailyLimit) - input.introducedToday)
}

export function finishPracticeTask(queue: PracticeTask[], rating: PracticeRating | null, assistance: PracticeAssistance): PracticeTask[] {
  const [task, ...remaining] = queue
  if (!task) return []
  if (task.kind === 'teach' || rating === null || (rating !== 1 && assistance === 'none')) return remaining
  const retry: PracticeTask = { ...task, id: `${task.id}:retry`, newTarget: false, retry: task.retry + 1, stage: 'return' }
  const next = [...remaining]
  next.splice(Math.min(next.length, 2 + Math.floor(Math.random() * 3)), 0, retry)
  return next
}
