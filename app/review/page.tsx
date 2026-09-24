import { learnerLanguage } from '@/lib/learner-language'
import Link from 'next/link'
import { guidedPracticeEnabled } from '@/lib/practice-config'
import { AppShell } from '@/components/AppShell'
import { ReviewSession } from '@/components/ReviewSession'
import { requireUser } from '@/lib/auth'
import type { ReviewItem } from '@/lib/types'
import type { WordForm } from '@/lib/word-forms'

export const dynamic = 'force-dynamic'

function copenhagenDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

export default async function ReviewPage(): Promise<React.JSX.Element> {
  const { supabase } = await requireUser()
  const now = new Date().toISOString()
  const today = copenhagenDate()

  const [{ data }, { data: profile }, { count: newReviewedToday }, { data: forms }] = await Promise.all([
    supabase.from('review_cards')
      .select('*, vocabulary_entries!inner(*)')
      .eq('vocabulary_entries.entry_kind', 'word')
      .lte('due', now)
      .order('due', { ascending: true })
      .limit(120),
    supabase.from('profiles').select('daily_new_limit, default_translation_language, autoplay_audio').single(),
    supabase.from('review_logs').select('id', { count: 'exact', head: true }).eq('study_date', today).eq('previous_state', 0),
    supabase.from('word_forms').select('*'),
  ])

  const dailyLimit = profile?.daily_new_limit || 10
  let newSlots = Math.max(0, dailyLimit - (newReviewedToday || 0))
  const ready = ((data || []) as ReviewItem[]).filter((card) => (
    card.vocabulary_entries?.entry_kind !== 'sentence'
    && !!card.vocabulary_entries?.translation
  ))
  const items = ready.filter((card) => {
    if (card.reps > 0) return true
    if (newSlots <= 0) return false
    newSlots -= 1
    return true
  })

  const formsByEntry: Record<string, WordForm[]> = {}
  for (const form of (forms || []) as WordForm[]) (formsByEntry[form.entry_id] ||= []).push(form)

  return <AppShell><div className="page-wrap review-page"><ReviewSession initialItems={items} formsByEntry={formsByEntry} translationLanguage={learnerLanguage(profile?.default_translation_language)} autoplayAudio={profile?.autoplay_audio ?? false} />{guidedPracticeEnabled && <Link href="/review/practice" className="review-practice-link">Practice <span aria-hidden="true">→</span></Link>}</div></AppShell>
}
