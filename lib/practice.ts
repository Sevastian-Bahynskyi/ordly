import type { TranslationLanguage } from './types'

/**
 * Practice is optional, bounded and separate from Review (issue #13, ADR 0001, ADR 0002).
 *
 * A session is planned once from the learner's saved Material, persisted whole, and played back
 * exercise by exercise. Nothing in it calls a model, and nothing it records reaches Review:
 * the only thing a Practice answer writes is an internal attempt used to choose later exercises.
 *
 * Ten exercise formats (issue #15), each a bounded interaction with a prepared answer:
 *
 * | format        | kind        | answered by                                             |
 * |---------------|-------------|---------------------------------------------------------|
 * | choice        | `pick`      | tapping the meaning of a Danish word                    |
 * | drag-gap      | `choose`    | placing one word in a gap                               |
 * | order         | `assemble`  | placing tiles into a sentence (several orders may count) |
 * | type          | `cloze`, `produce` | typing a word, form, phrase or saved sentence    |
 * | binary        | `binary`    | true or false for “X means Y”                           |
 * | odd-one-out   | `odd`       | tapping the noun whose gender differs                   |
 * | category-sort | `sort`      | placing each noun under `en` or `et`                    |
 * | match         | `match`     | pairing each Danish word with its meaning               |
 * | dialogue      | `dialogue`  | choosing a reply in a prepared exchange                 |
 * | flash-reveal  | `flash`     | revealing the meaning, then rating oneself              |
 *
 * `sense` (which meaning does this sentence use) is a variant of choice.
 */
export type PracticeKind = 'pick' | 'choose' | 'assemble' | 'cloze' | 'produce' | 'sense'
  | 'binary' | 'odd' | 'sort' | 'match' | 'dialogue' | 'flash'

/** Kinds that only appear in attempts recorded before this session contract. */
export type LegacyPracticeKind = 'recall' | 'teach' | 'build' | 'listen'

/**
 * `'choices'` marks an answer selected rather than produced; `'model'` an answer that was shown;
 * `'self'` a self-rating after a reveal, which is never checked evidence.
 */
export type PracticeAssistance = 'none' | 'hint' | 'choices' | 'model' | 'self'

/**
 * `unverified` is a typed sentence that does not match the saved one: it may still be valid
 * Danish, so it is neither marked right nor wrong. `dont_know` is an explicit “I don't know”.
 * `self_known` / `self_unknown` are flash-reveal self-ratings: what the learner says, not a check.
 */
export type PracticeResult = 'correct' | 'mostly' | 'incorrect' | 'unverified' | 'dont_know' | 'self_known' | 'self_unknown'

/** Kinds answered by tapping prepared options; everything except typing and self-rating. */
export const CHOICE_KINDS: readonly PracticeKind[] = ['assemble', 'choose', 'sense', 'pick', 'binary', 'odd', 'sort', 'match', 'dialogue']

/** Kinds that grade several targets at once and record an outcome for each. */
export const GROUP_KINDS: readonly PracticeKind[] = ['sort', 'match']

export const TYPED_KINDS: readonly PracticeKind[] = ['cloze', 'produce']

export function isChoiceKind(kind: PracticeKind): boolean {
  return CHOICE_KINDS.includes(kind)
}

export function isGroupKind(kind: PracticeKind): boolean {
  return GROUP_KINDS.includes(kind)
}

/**
 * One assessed target inside a group exercise, or one item on an odd-one-out board. `answer` is
 * what it must be placed with: its gender category for sort and odd-one-out, its meaning for match.
 */
export interface PracticeGroupItem {
  text: string
  answer: string
  targetKey: string
  entryId: string
  senseId: string
  contentVersion: string
}

/** A target's own outcome inside a group exercise, so one mistake never marks every word. */
export interface PracticeTargetOutcome {
  targetKey: string
  entryId: string
  senseId: string
  result: 'correct' | 'incorrect'
}

export interface PracticeTask {
  id: string
  /** `entry:<id>:sense:<sid>` — always a sense of a saved, owner-scoped Material entry. */
  targetKey: string
  entryId: string
  senseId: string
  kind: PracticeKind
  prompt: string
  answer: string
  danish: string
  translation: string
  hint: string
  example: string
  answerIsSentence: boolean
  contentVersion: string
  newTarget: boolean
  retry: number
  /**
   * Tap targets, already shuffled at build time so a reload re-renders the identical board — the
   * queue is persisted, so the order must never be recomputed on the client.
   */
  choices?: string[]
  /** A second sentence using a *different* sense of the same word (sense discrimination). */
  contrast?: string
  /** The translation of a gapped sentence, shown under a typed cloze. */
  context?: string
  /**
   * Every answer the prepared content accepts besides `answer`: another valid word order, another
   * natural reply. Grading never goes beyond this list.
   */
  accepted?: string[]
  /** Binary: the meaning claimed for the Danish word. */
  claim?: string
  /** Sort, match and odd-one-out: the words on the board, each with its own target. */
  items?: PracticeGroupItem[]
  /** Sort: the groups, e.g. `en` and `et`. */
  categories?: string[]
  /** Dialogue: support text in the learner language (who is speaking, where). */
  support?: string
  /**
   * Typed gaps: the word's other verified forms. Typing one of them is the wrong form, never a
   * harmless typo, because the form is what the gap tests.
   */
  forms?: string[]
}

export interface PracticeResponse {
  answer: string
  result: PracticeResult | null
  assistance: PracticeAssistance
  feedback: string
  responseMs: number
  revealed: boolean
  answeredAt: string | null
  /** The learner reported an unconfirmed typed answer as correct, for later content review. */
  reported?: boolean
  /** Group exercises: each target's own outcome. */
  targets?: PracticeTargetOutcome[]
}

/** Unsent input on the current exercise, saved on pause so resume shows exactly what was typed. */
export interface PracticeDraft {
  taskId: string
  answer: string
  /** Word-bank tile indices, in placed order. */
  picked: number[]
}

/** A draft as the client sends it; the server attaches it to the current exercise. */
export type PracticeDraftInput = Omit<PracticeDraft, 'taskId'>


export interface PracticeAttempt {
  id: string
  taskId: string
  targetKey: string
  entryId?: string
  senseId?: string
  kind: PracticeKind | LegacyPracticeKind
  /** Older attempts may also carry `'ungraded'` and a Review-style `rating`; both are read-only history. */
  result: PracticeResult | 'ungraded'
  assistance: PracticeAssistance | 'transcript'
  responseMs: number
  at: string
  contentVersion?: string
  locale?: TranslationLanguage
  newTarget?: boolean
  rating?: 1 | 2 | 3 | 4 | null
  /** Set only when the learner reported the answer; then the wording is kept for review. */
  reported?: boolean
  answer?: string
  /** Group exercises: each target's own outcome, so selection attributes mistakes precisely. */
  targets?: PracticeTargetOutcome[]
}

/** Bumped when the planner or exercise builders change what a stored task means. */
export const PRACTICE_CONTENT_REVISION = 'practice-v2'

export interface PracticeSessionState {
  version: 2
  id: string
  /** Every shuffle in the session derives from this, so a replan with the same seed is identical. */
  seed: string
  targetMinutes: number
  contentRevision: string
  locale: TranslationLanguage
  createdAt: string
  /** The head is the current exercise. */
  queue: PracticeTask[]
  /** This session's attempts, for its summary. The durable record is `practice_attempts`. */
  attempts: PracticeAttempt[]
  /** How many exercises were finished: the session's cursor. */
  completed: number
  /** Active time only. Paused time never counts toward the target. */
  elapsedSeconds: number
  /** When the running stretch began, or null while paused. */
  activeSince: string | null
  current: PracticeResponse | null
  draft: PracticeDraft | null
  finished: boolean
}

export interface PracticeStore {
  revision: number
  session: PracticeSessionState | null
}

/** Offered at every start. A custom target is any whole minute from 1 to `MAX_PRACTICE_MINUTES`. */
export const PRACTICE_MINUTE_PRESETS = [5, 10, 20] as const
export const DEFAULT_PRACTICE_MINUTES = 10
export const MAX_PRACTICE_MINUTES = 30

export function isPracticeMinutes(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_PRACTICE_MINUTES
}

/**
 * Rough seconds an exercise takes, used only to size a session to its target. Tapping is quicker
 * than typing; building a sentence from tiles sits in between.
 */
export function estimatedSeconds(task: Pick<PracticeTask, 'kind'>): number {
  switch (task.kind) {
    case 'match': case 'sort': return 45
    case 'assemble': return 35
    case 'cloze': case 'produce': return 30
    case 'dialogue': return 25
    case 'flash': return 15
    case 'binary': return 12
    default: return 20
  }
}

export function queueSeconds(queue: readonly Pick<PracticeTask, 'kind'>[]): number {
  return queue.reduce((total, task) => total + estimatedSeconds(task), 0)
}

/** No new exercise starts this close to the target; the current one always finishes. */
export const NEAR_TARGET_SECONDS = 15

/** A single running stretch counts at most this long, so an abandoned open tab cannot fill the target. */
export const MAX_STRETCH_SECONDS = 600

/** Active time including the running stretch up to `now`. */
export function activeSeconds(session: Pick<PracticeSessionState, 'elapsedSeconds' | 'activeSince'>, now: Date): number {
  if (!session.activeSince) return session.elapsedSeconds
  const stretch = (now.getTime() - Date.parse(session.activeSince)) / 1000
  return session.elapsedSeconds + Math.min(MAX_STRETCH_SECONDS, Math.max(0, Number.isFinite(stretch) ? stretch : 0))
}

export function targetReached(session: Pick<PracticeSessionState, 'targetMinutes'>, elapsedSeconds: number): boolean {
  return elapsedSeconds + NEAR_TARGET_SECONDS >= session.targetMinutes * 60
}

/** A missed or helped exercise comes back this many times at most in one session. */
export const MAX_RETRIES = 2

/**
 * The unaided form of a task, for the retry a miss schedules. Re-serving the same board would not
 * test anything new, so a gap with options comes back as a typed gap and a word bank as the typed
 * sentence. Meaning and sense discrimination have no unaided form here and return null.
 */
export function unaidedForm(task: PracticeTask): PracticeTask | null {
  // Only a gap or a word bank has a typed form; every other board has no fair unaided retry.
  if (!['assemble', 'choose', 'cloze', 'produce'].includes(task.kind)) return null
  if (task.kind !== 'assemble' && task.kind !== 'choose') return task
  const { choices: _choices, contrast: _contrast, ...rest } = task
  return task.kind === 'choose'
    ? { ...rest, kind: 'cloze', context: task.translation }
    : { ...rest, kind: 'produce' }
}

function hash(value: string): number {
  let result = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }
  return result >>> 0
}

/**
 * One attempt as the outcomes it holds for each target. A group exercise answered with one
 * mistake yields one miss for that word and a success for every other, never a miss for all.
 */
export function attemptOutcomes(attempt: PracticeAttempt): PracticeAttempt[] {
  if (!attempt.targets?.length) return [attempt]
  return attempt.targets.map((target) => ({ ...attempt, targetKey: target.targetKey, entryId: target.entryId, senseId: target.senseId, result: target.result, targets: undefined }))
}

/**
 * A miss: a wrong or unknown answer, or one that needed a hint or the answer shown. Attempts from
 * the retired contract also count an Again rating. The one rule both requeueing and target
 * selection use.
 */
/**
 * A typed answer the prepared answers could not confirm. The learner may report it as correct;
 * that queues it for content review and changes nothing else.
 */
export function isReportable(task: Pick<PracticeTask, 'kind'>, response: Pick<PracticeResponse, 'answer' | 'result' | 'revealed'>): boolean {
  return response.revealed && TYPED_KINDS.includes(task.kind) && Boolean(response.answer.trim())
    && (response.result === 'unverified' || response.result === 'incorrect')
}

export function missed(outcome: { result: PracticeAttempt['result'] | null; assistance: PracticeAttempt['assistance']; rating?: PracticeAttempt['rating'] }): boolean {
  return outcome.rating === 1 || outcome.result === 'incorrect' || outcome.result === 'dont_know' || outcome.result === 'self_unknown'
    || outcome.assistance === 'hint' || outcome.assistance === 'model'
}

/**
 * Advance past the current exercise. A miss comes back a few steps later in its unaided form,
 * at a position fixed by the session seed so the persisted queue is reproducible.
 */
export function finishPracticeTask(queue: readonly PracticeTask[], response: Pick<PracticeResponse, 'result' | 'assistance'>, seed: string): PracticeTask[] {
  const [task, ...remaining] = queue
  if (!task) return []
  if (!missed(response) || task.retry >= MAX_RETRIES) return remaining
  const source = unaidedForm(task)
  if (!source) return remaining
  const retry: PracticeTask = { ...source, id: `${task.id}:retry`, newTarget: false, retry: task.retry + 1 }
  const next = [...remaining]
  next.splice(Math.min(next.length, 2 + hash(`${seed}:${task.id}`) % 3), 0, retry)
  return next
}
