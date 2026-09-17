import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { AppShell } from '@/components/AppShell'
import { EntryEditor } from '@/components/EntryEditor'
import { MemoryRing } from '@/components/MemoryRing'
import { SynonymGraph } from '@/components/SynonymGraph'
import { requireUser } from '@/lib/auth'
import type { EntryLinkRow, LinkedEntryLabel } from '@/lib/entry-links'
import { activeSenses, parseSenses } from '@/lib/senses'
import { isUuid } from '@/lib/uuid'
import type { ReviewCard, VocabularyEntry } from '@/lib/types'

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

  const [{ data: entry }, { data: profile }, { data: links }] = await Promise.all([
    supabase.from('vocabulary_entries').select('*').eq('id', id).maybeSingle(),
    supabase.from('profiles').select('default_translation_language').single(),
    // Either end of the edge can be this entry: symmetric kinds are stored once, in canonical
    // order, so a filter on a_id alone would show half the graph.
    supabase
      .from('entry_links')
      .select('a_id, b_id, kind, source, confidence, confirmed')
      .or(`a_id.eq.${id},b_id.eq.${id}`)
      .is('dismissed_at', null),
  ])

  // RLS already scopes this to the signed-in user, so a missing row and someone else's row are
  // the same answer here: not found.
  if (!entry) notFound()

  const typedEntry = entry as VocabularyEntry
  const linkRows = (links || []) as EntryLinkRow[]
  const neighbourIds = [...new Set(linkRows.map((link) => link.a_id === id ? link.b_id : link.a_id))]

  // Second and last round-trip. The neighbour labels ride along with the review card rather
  // than after it, so the graph costs the page no extra depth (AGENTS.md §16).
  const [{ data: card }, { data: neighbours }] = await Promise.all([
    supabase.from('review_cards').select('*').eq('entry_id', typedEntry.id).maybeSingle(),
    neighbourIds.length
      ? supabase.from('vocabulary_entries').select('id, danish, translation').in('id', neighbourIds)
      : Promise.resolve({ data: [] as LinkedEntryLabel[] }),
  ])

  const senses = activeSenses(parseSenses(typedEntry.senses))
  const backHref = typedEntry.entry_kind === 'sentence' ? '/words?kind=sentences' : '/words'

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
            </h1>
            <p>
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
