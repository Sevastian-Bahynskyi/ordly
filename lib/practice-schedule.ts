import { createEmptyCard, fsrs, type Card, type Grade, type State } from 'ts-fsrs'
import type { PracticeRating, PracticeSchedule } from './practice'

const scheduler = fsrs({ request_retention: 0.9, enable_fuzz: true, enable_short_term: true, learning_steps: ['1m', '10m'], relearning_steps: ['10m'] })

export function schedulePractice(previous: PracticeSchedule | null, rating: PracticeRating, now: Date): PracticeSchedule {
  const card: Card = previous ? { ...previous, state: previous.state as State, due: new Date(previous.due), last_review: previous.last_review ? new Date(previous.last_review) : undefined } : createEmptyCard(now)
  const next = scheduler.next(card, now, rating as Grade).card
  return { ...next, due: next.due.toISOString(), last_review: next.last_review?.toISOString() }
}
