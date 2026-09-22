/**
 * `pick`, `assemble`, `choose` and `sense` are answered by tapping, so they always carry
 * `assistance: 'choices'` and can never become unaided evidence. `cloze` is the typed gap.
 * `teach`, `build`, `listen` and `dialogue` are no longer planned; they stay valid so a session
 * saved before the local exercise engine still loads.
 */
export type PracticeKind = 'recall' | 'produce' | 'teach' | 'build' | 'listen' | 'dialogue' | 'assemble' | 'choose' | 'sense' | 'pick' | 'cloze'
export type PracticeObjective = 'meaning' | 'production'
/**
 * `'choices'` (D14) marks an answer the learner selected rather than produced. It is the flag the
 * whole choice-based redesign hangs on: see `legacyEvidence` below.
 */
export type PracticeAssistance = 'none' | 'hint' | 'model' | 'transcript' | 'choices'

/** The kinds answered by tapping. Their assistance is decided by the kind, not by the client. */
export const CHOICE_KINDS: readonly PracticeKind[] = ['assemble', 'choose', 'sense', 'pick']

export function isChoiceKind(kind: PracticeKind): boolean {
  return CHOICE_KINDS.includes(kind)
}

export type PracticeResult = 'correct' | 'mostly' | 'incorrect' | 'ungraded'
export type PracticeRating = 1 | 2 | 3 | 4
export type PracticeRelation = 'exact' | 'valid_alternative' | 'grammar_adjustment' | 'incorrect'

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
  /**
   * Tap targets for `assemble` (word-bank tiles), `choose` (cloze options) and `sense`
   * (candidate meanings). Already shuffled at build time so a reload re-renders the identical
   * board — the queue is persisted, so the order must not be recomputed on the client.
   */
  choices?: string[]
  /** The sense this task trains, for an `entry:<id>:sense:<sid>` objective (D8/D18). */
  senseId?: string
  /** A second sentence using a *different* sense of the same word (D13 discrimination). */
  contrast?: string
  /** The translation of a gapped sentence, shown under a typed cloze. */
  context?: string
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
  finished?: boolean
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
  relation?: PracticeRelation
  modality: 'typed' | 'spoken'
  responseMs: number
  replays: number
  revealed: boolean
  answeredAt: string | null
  /** The learner's Danish answer with the smallest correction, when the semantic check supplied one. */
  correction?: string
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
  // D14: a tapped answer may still move the sense objective's own FSRS state forward. What it
  // must never do is reach the legacy card, and that is `legacyEvidence`'s job, not this one.
  if (response.assistance === 'choices') return true
  if (response.assistance !== 'none') return false
  return task.objective !== 'production' || response.target !== 'no'
}

/**
 * D14, the single rule that keeps choice-based recognition out of the legacy review system.
 *
 * `legacy_change` is the only argument of `commit_practice` that writes `review_cards`, appends
 * to `review_logs` and re-evaluates `vocabulary_entries.learning_status`. Returning false here
 * makes the caller commit `legacy_change = null`, so all three are untouched — no SQL change and
 * no new column needed. Tapping the right tile with the answer on screen is recognition, not
 * unaided production, and must not be able to mark a word mastered.
 *
 * The `cardId` half is belt and braces: choice tasks are built without one, so a future builder
 * that wrongly attached a card would still be caught by the assistance half.
 */
export function legacyEvidence(task: PracticeTask, response: PracticeResponse): boolean {
  return Boolean(task.cardId) && response.assistance !== 'choices'
}

/**
 * The unaided form of a task, used for the retry that supported success schedules.
 *
 * Re-serving the identical board would not be an unaided retry, so a choice task comes back as
 * typed production with its tiles removed. Sense discrimination has no unaided form — the choice
 * *is* the exercise — so it returns null and is simply not requeued after a success. An explicit
 * Again still requeues the original task untouched, preserving the objective as guided practice
 * requires.
 */
export function unaidedForm(task: PracticeTask): PracticeTask | null {
  if (task.kind === 'sense' || task.kind === 'pick') return null
  if (task.kind !== 'assemble' && task.kind !== 'choose') return task
  const { choices: _choices, contrast: _contrast, ...rest } = task
  return { ...rest, kind: 'produce' }
}

/** The most never-practised items one session introduces. */
export const NEW_TARGETS_PER_SESSION = 4

/**
 * New items this session may introduce. New words are the point of practising, so a backlog or a
 * weak run slows intake to one instead of stopping it; the daily limit still caps the total.
 */
export function newTargetBudget(input: { dailyLimit: number; introducedToday: number; dueCount: number; recent: boolean[] }): number {
  const recent = input.recent.slice(-20)
  const struggling = input.dueCount > 30 || (recent.length === 20 && recent.filter(Boolean).length < 14)
  const room = Math.max(0, input.dailyLimit - input.introducedToday)
  return Math.min(room, struggling ? 1 : NEW_TARGETS_PER_SESSION)
}

export function finishPracticeTask(queue: PracticeTask[], rating: PracticeRating | null, assistance: PracticeAssistance): PracticeTask[] {
  const [task, ...remaining] = queue
  if (!task) return []
  if (task.kind === 'teach' || rating === null || (rating !== 1 && assistance === 'none')) return remaining
  // Again keeps the original objective and the original board; a supported success comes back
  // in whatever form actually tests unaided recall.
  const source = rating === 1 ? task : unaidedForm(task)
  if (!source) return remaining
  const retry: PracticeTask = { ...source, id: `${source.id}:retry`, newTarget: false, retry: task.retry + 1, stage: 'return' }
  const next = [...remaining]
  next.splice(Math.min(next.length, 2 + Math.floor(Math.random() * 3)), 0, retry)
  return next
}
