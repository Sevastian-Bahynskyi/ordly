import { AppShell } from '@/components/AppShell'
import { SenseRefinementBackfill } from '@/components/SenseRefinementBackfill'
import { WordsClient } from '@/components/WordsClient'
import { requireUser } from '@/lib/auth'
import type { EntryLinkRow } from '@/lib/entry-links'
import { needsRefinement, REFINEMENT_BATCH_LIMIT } from '@/lib/sense-refinement'

export const dynamic = 'force-dynamic'

export default async function WordsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }): Promise<React.JSX.Element> {
  const { supabase } = await requireUser()
  const params = await searchParams
  // `entry_links` joins the existing parallel batch rather than adding a round-trip: chips must
  // not cost the list page a second wait (AGENTS.md §16).
  const [{ data: words }, { data: cards }, { data: profile }, { data: links }] = await Promise.all([
    supabase.from('vocabulary_entries').select('*').order('created_at', { ascending: false }),
    supabase.from('review_cards').select('*'),
    supabase.from('profiles').select('default_translation_language').single(),
    supabase.from('entry_links').select('a_id, b_id, kind, source, confidence, confirmed').is('dismissed_at', null),
  ])
  const wordEntries = (words || []).filter((entry) => entry.entry_kind !== 'sentence')
  // D11 phase 2, on demand: only the newest few still-unclassified words per visit.
  const unrefined = wordEntries.filter((entry) => needsRefinement(entry.senses)).slice(0, REFINEMENT_BATCH_LIMIT).map((entry) => entry.id)
  return <AppShell><SenseRefinementBackfill entryIds={unrefined} /><div className="page-wrap"><WordsClient initialWords={wordEntries} initialCards={cards || []} initialLinks={(links || []) as EntryLinkRow[]} initialQuery={params.q || ''} translationLanguage={profile?.default_translation_language || 'ru'} /></div></AppShell>
}
