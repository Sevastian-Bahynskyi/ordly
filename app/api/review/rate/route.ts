import { NextResponse } from 'next/server'
import { fsrs, type Card, type Grade } from 'ts-fsrs'
import { createClient } from '@/lib/supabase/server'

function copenhagenDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { cardId, rating, answerResult } = await request.json()
  if (!cardId || ![1, 2, 3, 4].includes(rating)) return NextResponse.json({ error: 'Invalid rating' }, { status: 400 })

  const { data: row, error } = await supabase.from('review_cards').select('*').eq('id', cardId).single()
  if (error || !row) return NextResponse.json({ error: 'Card not found' }, { status: 404 })

  const card: Card = {
    due: new Date(row.due), stability: Number(row.stability), difficulty: Number(row.difficulty), elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days, reps: row.reps, lapses: row.lapses, learning_steps: row.learning_steps, state: row.state,
    last_review: row.last_review ? new Date(row.last_review) : undefined,
  }
  const now = new Date()
  const scheduler = fsrs({ request_retention: 0.9, maximum_interval: 36500, enable_fuzz: true, enable_short_term: true, learning_steps: ['1m', '10m'], relearning_steps: ['10m'] })
  const grade = rating as Grade
  const result = scheduler.next(card, now, grade)
  const next = result.card

  const { error: updateError } = await supabase.from('review_cards').update({
    due: next.due.toISOString(), stability: next.stability, difficulty: next.difficulty, elapsed_days: next.elapsed_days,
    scheduled_days: next.scheduled_days, reps: next.reps, lapses: next.lapses, learning_steps: next.learning_steps,
    state: next.state, last_review: next.last_review?.toISOString() || now.toISOString(),
  }).eq('id', cardId)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  const learningStatus = next.reps === 0 ? 'new' : next.reps >= 5 && next.stability >= 21 ? 'mastered' : 'learning'
  await supabase.from('vocabulary_entries').update({ learning_status: learningStatus }).eq('id', row.entry_id)
  const studyDate = copenhagenDate(now)
  await supabase.from('review_logs').insert({
    card_id: cardId, entry_id: row.entry_id, rating, answer_result: answerResult || null, previous_state: card.state,
    stability: next.stability, difficulty: next.difficulty, scheduled_days: next.scheduled_days, reviewed_at: now.toISOString(), study_date: studyDate,
  })

  const { data: profile } = await supabase.from('profiles').select('current_streak, longest_streak, last_study_date').single()
  if (profile?.last_study_date !== studyDate) {
    const yesterday = copenhagenDate(new Date(now.getTime() - 24 * 60 * 60 * 1000))
    const current = profile?.last_study_date === yesterday ? (profile.current_streak || 0) + 1 : 1
    await supabase.from('profiles').update({ current_streak: current, longest_streak: Math.max(current, profile?.longest_streak || 0), last_study_date: studyDate }).eq('id', user.id)
  }

  return NextResponse.json({ due: next.due.toISOString(), status: learningStatus })
}
