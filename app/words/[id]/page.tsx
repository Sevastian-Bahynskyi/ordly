import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { AppShell } from '@/components/AppShell'
import { EntryEditor } from '@/components/EntryEditor'
import { MemoryRing } from '@/components/MemoryRing'
import { VocabularyIcon } from '@/components/VocabularyIcon'
import { requireUser } from '@/lib/auth'
import { activeSenses, parseSenses } from '@/lib/senses'
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

  const [{ data: entry }, { data: profile }] = await Promise.all([
    supabase.from('vocabulary_entries').select('*').eq('id', id).maybeSingle(),
    supabase.from('profiles').select('default_translation_language').single(),
  ])

  // RLS already scopes this to the signed-in user, so a missing row and someone else's row are
  // the same answer here: not found.
  if (!entry) notFound()

  const typedEntry = entry as VocabularyEntry
  const { data: card } = await supabase
    .from('review_cards')
    .select('*')
    .eq('entry_id', typedEntry.id)
    .maybeSingle()

  const senses = activeSenses(parseSenses(typedEntry.senses))
  const backHref = typedEntry.entry_kind === 'sentence' ? '/sentences' : '/words'

  return (
    <AppShell>
      <div className="page-wrap">
        <header className="page-header entry-page-header">
          <div>
            <Link className="entry-back" href={backHref}><ArrowLeft size={14} /> {typedEntry.entry_kind === 'sentence' ? 'All sentences' : 'All words'}</Link>
            <h1>
              {typedEntry.entry_kind !== 'sentence' && (
                <span className="word-bubble small entry-page-bubble">
                  <VocabularyIcon name={typedEntry.icon_name} fallback={typedEntry.danish.slice(0, 1).toUpperCase()} size={18} />
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
      </div>
    </AppShell>
  )
}
