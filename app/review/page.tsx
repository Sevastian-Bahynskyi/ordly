import { AppShell } from '@/components/AppShell'
import { ReviewSession } from '@/components/ReviewSession'
import { requireUser } from '@/lib/auth'
import type { ReviewItem } from '@/lib/types'

export const dynamic = 'force-dynamic'

function copenhagenDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

export default async function ReviewPage() {
  const { supabase } = await requireUser()
  const now = new Date().toISOString()
  const today = copenhagenDate()

  const [{ data }, { data: profile }, { count: newReviewedToday }] = await Promise.all([
    supabase.from('review_cards').select('*, vocabulary_entries(*)').lte('due', now).order('due', { ascending: true }).limit(120),
    supabase.from('profiles').select('daily_new_limit').single(),
    supabase.from('review_logs').select('id', { count: 'exact', head: true }).eq('study_date', today).eq('previous_state', 0),
  ])

  const dailyLimit = profile?.daily_new_limit || 10
  let newSlots = Math.max(0, dailyLimit - (newReviewedToday || 0))
  const ready = ((data || []) as ReviewItem[]).filter((card) => !!card.vocabulary_entries?.translation)
  const items = ready.filter((card) => {
    if (card.reps > 0) return true
    if (newSlots <= 0) return false
    newSlots -= 1
    return true
  })

  return <AppShell><div className="page-wrap review-page"><ReviewSession initialItems={items} /></div></AppShell>
}
