import { checkAnswer } from './answer'
import { sentenceTiles } from './practice-exercises'
import { isChoiceKind, type PracticeAssistance, type PracticeResult, type PracticeTask } from './practice'

/**
 * Deterministic Practice grading. No provider is ever called: every exercise carries its prepared
 * answer, and anything the prepared answer cannot settle is reported as unverified rather than
 * guessed at (ADR 0001).
 */

export interface PracticeGrade {
  result: PracticeResult
  assistance: PracticeAssistance
  feedback: string
}

/**
 * A tapped answer has to be one of the offered options. Without this the client could post free
 * text and collect a choice verdict for it, which is a grading claim the board never made.
 */
export function isOfferedChoice(task: PracticeTask, answer: string): boolean {
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

function sameTiles(left: string, right: string): boolean {
  return sentenceTiles(left).join(' ') === sentenceTiles(right).join(' ')
}

/**
 * @param helped the assistance already on the exercise before the answer (a hint), if any.
 */
export function gradePracticeAnswer(task: PracticeTask, rawAnswer: string, helped: PracticeAssistance = 'none'): PracticeGrade {
  const answer = rawAnswer.trim()
  const choiceKind = isChoiceKind(task.kind)
  if (!answer) return { result: 'dont_know', assistance: 'model', feedback: 'Here is the answer. It comes back a few steps later.' }

  if (choiceKind) {
    const right = task.kind === 'assemble' ? sameTiles(answer, task.answer) : answer === task.answer
    return right
      ? { result: 'correct', assistance: 'choices', feedback: 'Correct.' }
      : { result: 'incorrect', assistance: 'choices', feedback: 'Not this one. Compare with the answer below.' }
  }

  const assistance: PracticeAssistance = helped === 'hint' ? 'hint' : 'none'
  let result: PracticeResult = checkAnswer(answer, task.answer, { sentence: task.answerIsSentence })
  let feedback = result === 'correct' ? 'Correct.' : result === 'mostly' ? 'Almost. Check the highlighted letters.' : 'Not quite. Compare with the answer below.'
  if (task.kind === 'cloze' && result !== 'correct' && checkAnswer(answer, task.danish.replace(/^at\s+/iu, ''), { sentence: true }) === 'correct') {
    // The saved base form typed into a gap that needs an inflected one: right word, wrong form.
    // The form is what the gap tests, so this is checked before typo tolerance could forgive it.
    result = 'incorrect'
    feedback = `Right word. This sentence needs the form “${task.answer}”.`
  } else if (result === 'incorrect' && task.answerIsSentence) {
    // A different sentence may be perfectly good Danish. Without a prepared alternative it is
    // unverified, never marked wrong on a guess.
    result = 'unverified'
    feedback = 'This differs from your saved sentence. Compare the two; yours was not checked.'
  }
  return { result, assistance, feedback }
}
