import { checkAnswer } from './answer'
import { sentenceTiles } from './practice-exercises'
import { isChoiceKind, type PracticeAssistance, type PracticeResult, type PracticeTargetOutcome, type PracticeTask } from './practice'

/**
 * Deterministic Practice grading. No provider is ever called: every exercise carries its prepared
 * answers, and anything they cannot settle is reported as unverified rather than guessed at
 * (ADR 0001, spec #12 decision 9).
 */

/**
 * What the feedback says, as a code the client words in the learner language. Sessions saved
 * before issue #15 hold English sentences here instead, which the client still shows as they are.
 */
export type PracticeFeedbackCode = 'correct' | 'mostly' | 'incorrect' | 'wrong_form' | 'unverified' | 'dont_know' | 'self_known' | 'self_unknown' | 'partial'

export interface PracticeGrade {
  result: PracticeResult
  assistance: PracticeAssistance
  feedback: PracticeFeedbackCode
  /** Group exercises only: each target's own outcome. */
  targets?: PracticeTargetOutcome[]
}

/** Sort and match answer with a JSON object: item text → the category or meaning it was placed with. */
export function parsePlacement(answer: string): Record<string, string> | null {
  try {
    const value: unknown = JSON.parse(answer)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const entries = Object.entries(value as Record<string, unknown>)
    return entries.every(([, placed]) => typeof placed === 'string') ? Object.fromEntries(entries) as Record<string, string> : null
  } catch {
    return null
  }
}

/**
 * Whether a tapped answer is one the board actually offered. Without this the client could post
 * free text and collect a choice verdict for it, which is a grading claim the board never made.
 */
export function isOfferedChoice(task: PracticeTask, answer: string): boolean {
  if (task.kind === 'binary') return answer === 'true' || answer === 'false'
  if (task.kind === 'sort' || task.kind === 'match') {
    const placement = parsePlacement(answer)
    const items = task.items || []
    const allowed = new Set(task.kind === 'sort' ? task.categories || [] : items.map((item) => item.answer))
    return Boolean(placement) && items.length > 0 && Object.keys(placement!).length === items.length
      && items.every((item) => placement![item.text] !== undefined && allowed.has(placement![item.text]))
      // A meaning can be placed once only; two words cannot both claim it.
      && (task.kind === 'sort' || new Set(Object.values(placement!)).size === items.length)
  }
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
 * Word order compares words, not the capital or full stop a tile happens to carry: tiles come from
 * the saved sentence, so another valid order (`I dag arbejder jeg.`) can only be built from them
 * with its capital and stop in the wrong place.
 */
function orderKey(sentence: string): string {
  return sentenceTiles(sentence).map((tile) => tile.toLocaleLowerCase('da-DK').replace(/[.,!?;:]+$/u, '')).join(' ')
}

function sameTiles(left: string, right: string): boolean {
  return orderKey(left) === orderKey(right)
}

/** The answer and every prepared alternative. */
function acceptedAnswers(task: PracticeTask): string[] {
  return [task.answer, ...(task.accepted || [])]
}

function groupGrade(task: PracticeTask, placement: Record<string, string>): PracticeGrade {
  const targets = (task.items || []).map((item): PracticeTargetOutcome => ({
    targetKey: item.targetKey, entryId: item.entryId, senseId: item.senseId,
    result: placement[item.text] === item.answer ? 'correct' : 'incorrect',
  }))
  const right = targets.filter((target) => target.result === 'correct').length
  return {
    result: right === targets.length ? 'correct' : 'incorrect',
    assistance: 'choices',
    feedback: right === targets.length ? 'correct' : right ? 'partial' : 'incorrect',
    targets,
  }
}

/**
 * @param helped the assistance already on the exercise before the answer (a hint), if any.
 * @returns null when the answer is not something the exercise could have produced.
 */
export function gradePracticeAnswer(task: PracticeTask, rawAnswer: string, helped: PracticeAssistance = 'none'): PracticeGrade | null {
  const answer = rawAnswer.trim()
  if (!answer) return { result: 'dont_know', assistance: 'model', feedback: 'dont_know' }

  if (task.kind === 'flash') {
    // A self-rating after a reveal: recorded as what the learner said, never as checked recall.
    if (answer !== 'known' && answer !== 'unknown') return null
    return answer === 'known'
      ? { result: 'self_known', assistance: 'self', feedback: 'self_known' }
      : { result: 'self_unknown', assistance: 'self', feedback: 'self_unknown' }
  }

  if (isChoiceKind(task.kind) && !isOfferedChoice(task, answer)) return null

  if (task.kind === 'sort' || task.kind === 'match') return groupGrade(task, parsePlacement(answer)!)

  if (isChoiceKind(task.kind)) {
    const right = task.kind === 'assemble'
      ? acceptedAnswers(task).some((accepted) => sameTiles(answer, accepted))
      : acceptedAnswers(task).includes(answer)
    return right
      ? { result: 'correct', assistance: 'choices', feedback: 'correct' }
      : { result: 'incorrect', assistance: 'choices', feedback: 'incorrect' }
  }

  const assistance: PracticeAssistance = helped === 'hint' ? 'hint' : 'none'
  // Another verified form of the word is the wrong form, even one letter away (huse for huset).
  const typed = answer.toLocaleLowerCase('da-DK')
  if (task.kind === 'cloze' && (task.forms || []).includes(typed) && !acceptedAnswers(task).some((accepted) => accepted.toLocaleLowerCase('da-DK') === typed)) {
    return { result: 'incorrect', assistance, feedback: 'wrong_form' }
  }
  const checks = acceptedAnswers(task).map((accepted) => checkAnswer(answer, accepted, { sentence: task.answerIsSentence }))
  let result: PracticeResult = checks.includes('correct') ? 'correct' : checks.includes('mostly') ? 'mostly' : 'incorrect'
  let feedback: PracticeFeedbackCode = result
  if (task.kind === 'cloze' && result !== 'correct' && checkAnswer(answer, task.danish.replace(/^at\s+/iu, ''), { sentence: true }) === 'correct') {
    // The saved base form typed into a gap that needs an inflected one: right word, wrong form.
    // The form is what the gap tests, so this is checked before typo tolerance could forgive it.
    result = 'incorrect'
    feedback = 'wrong_form'
  } else if (result === 'incorrect' && task.answerIsSentence) {
    // A different sentence may be perfectly good Danish. Without a prepared alternative it is
    // unverified, never marked wrong on a guess.
    result = 'unverified'
    feedback = 'unverified'
  }
  return { result, assistance, feedback }
}
