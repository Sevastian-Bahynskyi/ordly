import { NextResponse } from 'next/server'
import { fsrs, type Card, type Grade } from 'ts-fsrs'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { logId, rating, answerResult, answerText } = await request.json()
  if (!logId || ![1, 2, 3, 4].includes(rating)) return NextResponse.json({ error: 'Invalid revision' }, { status: 400 })

  const { data: log, error } = await supabase.from('review_logs').select('*').eq('id', logId).single()
  if (error || !log) return NextResponse.json({ error: 'Review log not found' }, { status: 404 })
  if (!log.previous_card) return NextResponse.json({ error: 'This older review cannot be revised safely.' }, { status: 409 })

  const { data: later } = await supabase
    .from('review_logs')
    .select('id')
    .eq('card_id', log.card_id)
    .gt('reviewed_at', log.reviewed_at)
    .limit(1)
  if (later?.length) return NextResponse.json({ error: 'This card has already been reviewed again.' }, { status: 409 })

  const prev = log.previous_card as Record<string, unknown>
  const card: Card = {
    due: new Date(String(prev.due)),
    stability: Number(prev.stability),
    difficulty: Number(prev.difficulty),
    elapsed_days: Number(prev.elapsed_days),
    scheduled_days: Number(prev.scheduled_days),
    reps: Number(prev.reps),
    lapses: Number(prev.lapses),
    learning_steps: Number(prev.learning_steps),
    state: Number(prev.state),
    last_review: prev.last_review ? new Date(String(prev.last_review)) : undefined,
  }

  const reviewedAt = new Date(log.reviewed_at)
  const scheduler = fsrs({ request_retention: 0.9, maximum_interval: 36500, enable_fuzz: true, enable_short_term: true, learning_steps: ['1m', '10m'], relearning_steps: ['10m'] })
  const next = scheduler.next(card, reviewedAt, rating as Grade).card

  const { error: cardError } = await supabase.from('review_cards').update({
    due: next.due.toISOString(), stability: next.stability, difficulty: next.difficulty, elapsed_days: next.elapsed_days,
    scheduled_days: next.scheduled_days, reps: next.reps, lapses: next.lapses, learning_steps: next.learning_steps,
    state: next.state, last_review: next.last_review?.toISOString() || reviewedAt.toISOString(),
  }).eq('id', log.card_id)
  if (cardError) return NextResponse.json({ error: cardError.message }, { status: 500 })

  const learningStatus = next.reps === 0 ? 'new' : next.reps >= 5 && next.stability >= 21 ? 'mastered' : 'learning'
  await supabase.from('vocabulary_entries').update({ learning_status: learningStatus }).eq('id', log.entry_id)

  const { error: logError } = await supabase.from('review_logs').update({
    rating,
    answer_result: answerResult || null,
    answer_text: answerText || null,
    stability: next.stability,
    difficulty: next.difficulty,
    scheduled_days: next.scheduled_days,
  }).eq('id', logId)
  if (logError) return NextResponse.json({ error: logError.message }, { status: 500 })

  return NextResponse.json({ due: next.due.toISOString(), status: learningStatus })
}
