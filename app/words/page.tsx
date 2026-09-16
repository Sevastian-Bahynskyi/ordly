import { AppShell } from '@/components/AppShell'
import { WordsClient } from '@/components/WordsClient'
import { requireUser } from '@/lib/auth'
import type { EntryLinkRow } from '@/lib/entry-links'

export const dynamic = 'force-dynamic'

export default async function WordsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { supabase } = await requireUser()
  const params = await searchParams
  // `entry_links` joins the existing parallel batch rather than adding a round-trip: chips must
  // not cost the list page a second wait (AGENTS.md §16).
  const [{ data: words }, { data: cards }, { data: profile }, { data: links }] = await Promise.all([
    supabase.from('vocabulary_entries').select('*').order('created_at', { ascending: false }),
    supabase.from('review_cards').select('*'),
    supabase.from('profiles').select('default_translation_language').single(),
    supabase.from('entry_links').select('a_id, b_id, kind, source, confidence, confirmed'),
  ])
  const wordEntries = (words || []).filter((entry) => entry.entry_kind !== 'sentence')
  return <AppShell><div className="page-wrap"><WordsClient initialWords={wordEntries} initialCards={cards || []} initialLinks={(links || []) as EntryLinkRow[]} initialQuery={params.q || ''} translationLanguage={profile?.default_translation_language || 'ru'} /></div></AppShell>
}
