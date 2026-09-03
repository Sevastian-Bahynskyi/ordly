import { AppShell } from '@/components/AppShell'
import { WordsClient } from '@/components/WordsClient'
import { requireUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function WordsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { supabase } = await requireUser()
  const params = await searchParams
  const [{ data: words }, { data: cards }, { data: profile }] = await Promise.all([
    supabase.from('vocabulary_entries').select('*').order('created_at', { ascending: false }),
    supabase.from('review_cards').select('*'),
    supabase.from('profiles').select('default_translation_language').single(),
  ])
  const wordEntries = (words || []).filter((entry) => entry.entry_kind !== 'sentence')
  return <AppShell><div className="page-wrap"><WordsClient initialWords={wordEntries} initialCards={cards || []} initialQuery={params.q || ''} translationLanguage={profile?.default_translation_language || 'ru'} /></div></AppShell>
}
