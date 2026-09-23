import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { AppShell } from '@/components/AppShell'
import { DefiniteNoun } from '@/components/DefiniteNoun'
import { EntryEditor } from '@/components/EntryEditor'
import { MemoryRing } from '@/components/MemoryRing'
import { SynonymGraph } from '@/components/SynonymGraph'
import { WordAudio } from '@/components/WordAudio'
import { WordStructure } from '@/components/WordStructure'
import { requireUser } from '@/lib/auth'
import { definiteFormKey, fetchCorDefiniteForms } from '@/lib/cor'
import type { EntryLinkRow, LinkedEntryLabel } from '@/lib/entry-links'
import { inferDanishInputKind } from '@/lib/entry-kind'
import { activeSenses, nounGenderOf, parseSenses } from '@/lib/senses'
import { isUuid } from '@/lib/uuid'
import type { ReviewCard, VocabularyEntry } from '@/lib/types'
import type { WordForm } from '@/lib/word-forms'

export const dynamic = 'force-dynamic'

/**
 * Inspect and edit one entry (D7). This is a real route rather than a modal, so it is
 * linkable, back-navigable, prefetchable from the Words and Sentences lists, and picks up the
 * app's route-loading feedback for free (AGENTS.md §5, §16).
 */
export default async function EntryPage({ params }: { params: Promise<{ id: string }> }): Promise<React.JSX.Element> {
  const { supabase } = await requireUser()
  const { id } = await params
  // The id is interpolated into a PostgREST `or` filter below, so it is validated as a uuid
  // before it goes anywhere near the query rather than trusted from the URL.
  if (!isUuid(id)) notFound()

  const [{ data: entry }, { data: profile }, { data: links }, { data: groupEntries }, { data: forms }] = await Promise.all([
    supabase.from('vocabulary_entries').select('*').eq('id', id).maybeSingle(),
    supabase.from('profiles').select('default_translation_language').single(),
    // Either end of the edge can be this entry: symmetric kinds are stored once, in canonical
    // order, so a filter on a_id alone would show half the graph.
    supabase
      .from('entry_links')
      .select('a_id, b_id, kind, source, confidence, confirmed, concept')
      .or(`a_id.eq.${id},b_id.eq.${id}`)
      .is('dismissed_at', null),
    supabase.from('vocabulary_entries').select('id, danish, translation, entry_kind, canonical_entry_id').eq('entry_kind', 'word').order('danish'),
    supabase.from('word_forms').select('*').eq('entry_id', id),
  ])

  // RLS already scopes this to the signed-in user, so a missing row and someone else's row are
  // the same answer here: not found.
  if (!entry) notFound()

  const typedEntry = entry as VocabularyEntry
  const linkRows = (links || []) as EntryLinkRow[]
  const neighbourIds = [...new Set(linkRows.map((link) => link.a_id === id ? link.b_id : link.a_id))]

  // Second and last round-trip. The neighbour labels ride along with the review card rather
  // than after it, so the graph costs the page no extra depth (AGENTS.md §16).
  // The recording belongs to the catalog row, not to the entry: the entry is a copy, and audio is
  // reference data every account shares (issue #6 §5). One primary-key read, and null is ordinary.
  const [{ data: card }, { data: neighbours }, { data: catalog }] = await Promise.all([
    supabase.from('review_cards').select('*').eq('entry_id', typedEntry.id).maybeSingle(),
    neighbourIds.length
      ? supabase.from('vocabulary_entries').select('id, danish, translation').in('id', neighbourIds)
      : Promise.resolve({ data: [] as LinkedEntryLabel[] }),
    typedEntry.catalog_lemma
      ? supabase.from('word_catalog').select('audio_path').eq('lemma', typedEntry.catalog_lemma)
        .eq('kind', typedEntry.entry_kind === 'sentence' ? 'phrase' : 'word').maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const senses = activeSenses(parseSenses(typedEntry.senses))
  const backHref = typedEntry.entry_kind === 'sentence' ? '/words?kind=sentences' : '/words'

  // A noun's gender is shown as the word itself — `gulvet`, not `et` beside `gulv`.
  const gender = nounGenderOf(senses)
  const definite = gender ? (await fetchCorDefiniteForms(supabase, [typedEntry.danish])).get(definiteFormKey(typedEntry.danish, gender)) : undefined

  return (
    <AppShell>
      <div className="page-wrap">
        <header className="page-header entry-page-header">
          <div>
            <Link className="entry-back" href={backHref}><ArrowLeft size={14} /> {typedEntry.entry_kind === 'sentence' ? 'Sentences' : 'Material'}</Link>
            <h1>
              {typedEntry.entry_kind !== 'sentence' && (
                <span className="word-bubble small entry-page-bubble">
                  {typedEntry.danish.slice(0, 1).toLocaleUpperCase('da-DK')}
                </span>
              )}
              {typedEntry.danish}
              <WordAudio audioPath={typedEntry.audio_path ?? (catalog as { audio_path: string | null } | null)?.audio_path ?? null} label={typedEntry.danish} />
            </h1>
            <p>
              {gender && definite && <><DefiniteNoun definite={definite} gender={gender} /> · </>}
              {typedEntry.pronunciation || 'No pronunciation yet'}
              {senses.length > 1 && ` · ${senses.length} meanings`}
            </p>
          </div>
          <div className="entry-page-meta">
            {card && <MemoryRing item={card as ReviewCard} />}
            <span className={`status-chip ${typedEntry.learning_status}`}>{typedEntry.learning_status}</span>
          </div>
        </header>

        <EntryEditor
          mode="edit"
          entry={typedEntry}
          translationLanguage={profile?.default_translation_language || 'ru'}
        />

        {typedEntry.entry_kind === 'word' && inferDanishInputKind(typedEntry.danish) === 'word' && <WordStructure entry={typedEntry} entries={(groupEntries || []) as Pick<VocabularyEntry, 'id' | 'danish' | 'translation' | 'entry_kind' | 'canonical_entry_id'>[]} initialForms={(forms || []) as WordForm[]} />}

        {/* Sentences are learned whole and never get synonym links, so the graph would always be empty. */}
        {typedEntry.entry_kind !== 'sentence' && (
          <SynonymGraph
            entryId={typedEntry.id}
            entryDanish={typedEntry.danish}
            entryKind={typedEntry.entry_kind || 'word'}
            initialLinks={linkRows}
            neighbourEntries={(neighbours || []) as LinkedEntryLabel[]}
          />
        )}
      </div>
    </AppShell>
  )
}
