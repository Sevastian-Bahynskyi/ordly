import { AppShell } from '@/components/AppShell'
import { MaterialClient, type MaterialKind } from '@/components/MaterialClient'
import { SenseRefinementBackfill } from '@/components/SenseRefinementBackfill'
import { requireUser } from '@/lib/auth'
import { fetchCorDefiniteForms } from '@/lib/cor'
import { isPartOfSpeech, nounGenderOf, parseSenses } from '@/lib/senses'
import { needsRefinement, REFINEMENT_BATCH_LIMIT } from '@/lib/sense-refinement'
import type { WordForm } from '@/lib/word-forms'

export const dynamic = 'force-dynamic'

const kinds: readonly MaterialKind[] = ['all', 'words', 'phrases', 'sentences']

export default async function MaterialPage({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string; pos?: string; missingAudio?: string }> }): Promise<React.JSX.Element> {
  const { supabase } = await requireUser()
  const params = await searchParams
  const [{ data: entries }, { data: cards }, { data: profile }, { data: forms }] = await Promise.all([
    supabase.from('vocabulary_entries').select('*').order('created_at', { ascending: false }),
    supabase.from('review_cards').select('*'),
    supabase.from('profiles').select('default_translation_language').single(),
    supabase.from('word_forms').select('*'),
  ])
  const all = entries || []
  // D11 phase 2, on demand: only the newest few still-unclassified words per visit.
  const unrefined = all.filter((entry) => entry.entry_kind !== 'sentence' && needsRefinement(entry.senses)).slice(0, REFINEMENT_BATCH_LIMIT).map((entry) => entry.id)
  const initialKind = kinds.find((kind) => kind === params.kind) || 'all'
  const initialPos = isPartOfSpeech(params.pos) ? params.pos : 'all'
  // One extra indexed read for the whole list: every noun's definite singular, so the gender is
  // shown as `gulvet` rather than as a label beside `gulv` (issue #5 follow-up).
  const nouns = all.filter((entry) => nounGenderOf(parseSenses(entry.senses)))
  const catalogLemmas = [...new Set(all.map((entry) => entry.catalog_lemma).filter((lemma): lemma is string => Boolean(lemma)))]
  const [definiteForms, catalogAudio] = await Promise.all([
    fetchCorDefiniteForms(supabase, nouns.map((entry) => entry.danish)),
    catalogLemmas.length
      ? supabase.from('word_catalog').select('lemma, kind, audio_path').in('lemma', catalogLemmas)
      : Promise.resolve({ data: [] as { lemma: string; kind: string; audio_path: string | null }[] }),
  ])
  const audioByCatalogKey = Object.fromEntries((catalogAudio.data || []).map((row) => [`${row.lemma}:${row.kind}`, row.audio_path]))
  return <AppShell><SenseRefinementBackfill entryIds={unrefined} /><div className="page-wrap"><MaterialClient initialWords={all} initialCards={cards || []} initialForms={(forms || []) as WordForm[]} catalogAudio={audioByCatalogKey} initialMissingAudio={params.missingAudio === '1'} initialQuery={params.q || ''} initialKind={initialKind} initialPos={initialPos} translationLanguage={profile?.default_translation_language || 'ru'} definiteForms={Object.fromEntries(definiteForms)} /></div></AppShell>
}
