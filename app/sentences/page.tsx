import { AppShell } from '@/components/AppShell'
import { SentencesClient } from '@/components/SentencesClient'
import { requireUser } from '@/lib/auth'
import type { EntryLinkRow } from '@/lib/entry-links'

export const dynamic = 'force-dynamic'

export default async function SentencesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { supabase } = await requireUser()
  const params = await searchParams
  const [{ data: entries }, { data: cards }, { data: profile }, { data: links }] = await Promise.all([
    supabase.from('vocabulary_entries').select('*').order('created_at', { ascending: false }),
    supabase.from('review_cards').select('*'),
    supabase.from('profiles').select('default_translation_language').single(),
    supabase.from('entry_links').select('a_id, b_id, kind, source, confidence, confirmed'),
  ])

  return (
    <AppShell>
      <div className="page-wrap">
        <SentencesClient
          initialEntries={entries || []}
          initialCards={cards || []}
          initialLinks={(links || []) as EntryLinkRow[]}
          initialQuery={params.q || ''}
          translationLanguage={profile?.default_translation_language || 'ru'}
        />
      </div>
    </AppShell>
  )
}
