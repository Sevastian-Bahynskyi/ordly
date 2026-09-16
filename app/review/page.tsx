import Link from 'next/link'
import { guidedPracticeEnabled } from '@/lib/practice-config'
import { AppShell } from '@/components/AppShell'
import { ReviewSession } from '@/components/ReviewSession'
import { requireUser } from '@/lib/auth'
import { linkedSensesFor, type SynonymEntry, type SynonymLinkRow } from '@/lib/synonyms'
import type { EntrySense, ReviewItem } from '@/lib/types'

type EmbeddedLinkRow = SynonymLinkRow & { a: SynonymEntry | null; b: SynonymEntry | null }

/** The linked senses for each reviewed entry, from edges whose neighbour rows came embedded. */
function linkedSensesByEntry(entryIds: readonly string[], rows: readonly EmbeddedLinkRow[]): Record<string, EntrySense[]> {
  const entries = rows.flatMap((row) => [row.a, row.b]).filter((entry): entry is SynonymEntry => Boolean(entry))
  const result: Record<string, EntrySense[]> = {}
  for (const entryId of entryIds) {
    const senses = linkedSensesFor(entryId, rows, entries)
    if (senses.length) result[entryId] = senses
  }
  return result
}

export const dynamic = 'force-dynamic'

function copenhagenDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

export default async function ReviewPage(): Promise<React.JSX.Element> {
  const { supabase } = await requireUser()
  const now = new Date().toISOString()
  const today = copenhagenDate()

  const [{ data }, { data: profile }, { count: newReviewedToday }, { data: links }] = await Promise.all([
    supabase.from('review_cards').select('*, vocabulary_entries(*)').lte('due', now).order('due', { ascending: true }).limit(120),
    supabase.from('profiles').select('daily_new_limit, default_translation_language').single(),
    supabase.from('review_logs').select('id', { count: 'exact', head: true }).eq('study_date', today).eq('previous_state', 0),
    // D5: both ends of each live synonym edge ride along in the same parallel batch, so grading
    // can accept a linked entry's meanings without a round-trip per card (AGENTS.md §16).
    supabase.from('entry_links')
      .select('a_id, b_id, kind, confirmed, a:vocabulary_entries!entry_links_a_id_fkey(id, danish, translation, senses, entry_kind), b:vocabulary_entries!entry_links_b_id_fkey(id, danish, translation, senses, entry_kind)')
      .eq('kind', 'synonym')
      .is('dismissed_at', null)
      .limit(2000),
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

  const linkedSenses = linkedSensesByEntry(items.map((item) => item.entry_id), (links || []) as unknown as EmbeddedLinkRow[])

  return <AppShell><div className="page-wrap review-page">{guidedPracticeEnabled && <Link href="/review/practice" className="review-practice-link"><span><strong>Start guided practice</strong><small>Recall, build sentences, and use your Danish.</small></span><span>→</span></Link>}<ReviewSession initialItems={items} linkedSenses={linkedSenses} translationLanguage={profile?.default_translation_language || 'ru'} /></div></AppShell>
}
