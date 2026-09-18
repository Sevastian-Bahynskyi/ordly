import { AppShell } from '@/components/AppShell'
import { MaterialClient, type MaterialKind } from '@/components/MaterialClient'
import { SenseRefinementBackfill } from '@/components/SenseRefinementBackfill'
import { requireUser } from '@/lib/auth'
import { fetchCorDefiniteForms } from '@/lib/cor'
import type { EntryLinkRow } from '@/lib/entry-links'
import { isPartOfSpeech, nounGenderOf, parseSenses } from '@/lib/senses'
import { needsRefinement, REFINEMENT_BATCH_LIMIT } from '@/lib/sense-refinement'

export const dynamic = 'force-dynamic'

const kinds: readonly MaterialKind[] = ['all', 'words', 'phrases', 'sentences']

export default async function MaterialPage({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string; pos?: string }> }): Promise<React.JSX.Element> {
  const { supabase } = await requireUser()
  const params = await searchParams
  // `entry_links` joins the existing parallel batch rather than adding a round-trip: chips must
  // not cost the list page a second wait (AGENTS.md §16).
  const [{ data: entries }, { data: cards }, { data: profile }, { data: links }] = await Promise.all([
    supabase.from('vocabulary_entries').select('*').order('created_at', { ascending: false }),
    supabase.from('review_cards').select('*'),
    supabase.from('profiles').select('default_translation_language').single(),
    supabase.from('entry_links').select('a_id, b_id, kind, source, confidence, confirmed, concept').is('dismissed_at', null),
  ])
  const all = entries || []
  // D11 phase 2, on demand: only the newest few still-unclassified words per visit.
  const unrefined = all.filter((entry) => entry.entry_kind !== 'sentence' && needsRefinement(entry.senses)).slice(0, REFINEMENT_BATCH_LIMIT).map((entry) => entry.id)
  const initialKind = kinds.find((kind) => kind === params.kind) || 'all'
  const initialPos = isPartOfSpeech(params.pos) ? params.pos : 'all'
  // One extra indexed read for the whole list: every noun's definite singular, so the gender is
  // shown as `gulvet` rather than as a label beside `gulv` (issue #5 follow-up).
  const nouns = all.filter((entry) => nounGenderOf(parseSenses(entry.senses)))
  const definiteForms = Object.fromEntries(await fetchCorDefiniteForms(supabase, nouns.map((entry) => entry.danish)))
  return <AppShell><SenseRefinementBackfill entryIds={unrefined} /><div className="page-wrap"><MaterialClient initialWords={all} initialCards={cards || []} initialLinks={(links || []) as EntryLinkRow[]} initialQuery={params.q || ''} initialKind={initialKind} initialPos={initialPos} translationLanguage={profile?.default_translation_language || 'ru'} definiteForms={definiteForms} /></div></AppShell>
}
