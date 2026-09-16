'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { BookOpenText, PenLine, Search, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  neighboursByEntry,
  withConfirmedLink,
  withoutLink,
  type EntryLinkRow,
  type LinkedEntryLabel,
} from '@/lib/entry-links'
import type { LearningStatus, ReviewCard, VocabularyEntry } from '@/lib/types'
import { AddWordComposer } from './AddWordComposer'
import { MemoryRing } from './MemoryRing'
import { SynonymChips } from './SynonymChips'

type SentenceFilter = 'all' | 'manual' | 'examples'
type SentenceRow = {
  id: string
  sourceEntryId: string
  danish: string
  translation: string | null
  pronunciation: string | null
  source: 'manual' | 'example'
  parentDanish: string | null
  learningStatus: LearningStatus | null
  createdAt: string
}

export function SentencesClient({
  initialEntries,
  initialCards,
  initialLinks = [],
  initialQuery = '',
  translationLanguage = 'ru',
}: {
  initialEntries: VocabularyEntry[]
  initialCards: ReviewCard[]
  initialLinks?: EntryLinkRow[]
  initialQuery?: string
  translationLanguage?: 'ru' | 'en' | 'uk'
}) {
  const [entries, setEntries] = useState(initialEntries)
  const [cards, setCards] = useState(initialCards)
  const [links, setLinks] = useState<EntryLinkRow[]>(initialLinks)
  const [query, setQuery] = useState(initialQuery)
  const [filter, setFilter] = useState<SentenceFilter>('all')

  useEffect(() => setEntries(initialEntries), [initialEntries])
  useEffect(() => setCards(initialCards), [initialCards])
  useEffect(() => setLinks(initialLinks), [initialLinks])

  const cardsByEntry = useMemo(() => new Map(cards.map((card) => [card.entry_id, card])), [cards])

  // Chips describe the entry the row opens: its own links for a sentence written by hand, the
  // owning word's links for a derived example, which has no entry of its own.
  const neighbours = useMemo(
    () => neighboursByEntry(links, new Map<string, LinkedEntryLabel>(
      entries.map((entry) => [entry.id, { id: entry.id, danish: entry.danish, translation: entry.translation }]),
    )),
    [links, entries],
  )

  function resolveLink(link: EntryLinkRow, action: 'confirm' | 'dismiss') {
    setLinks((current) => action === 'dismiss' ? withoutLink(current, link) : withConfirmedLink(current, link))
  }

  const rows = useMemo<SentenceRow[]>(() => {
    const manual = entries
      .filter((entry) => entry.entry_kind === 'sentence' && entry.danish.trim())
      .map((entry) => ({
        id: `manual:${entry.id}`,
        sourceEntryId: entry.id,
        danish: entry.danish,
        translation: entry.translation,
        pronunciation: entry.pronunciation,
        source: 'manual' as const,
        parentDanish: null,
        learningStatus: entry.learning_status,
        createdAt: entry.created_at,
      }))

    const examples = entries
      .filter((entry) => entry.entry_kind !== 'sentence' && Boolean(entry.example_sentence?.trim()))
      .map((entry) => ({
        id: `example:${entry.id}`,
        sourceEntryId: entry.id,
        danish: entry.example_sentence!.trim(),
        translation: entry.example_translation?.trim() || null,
        pronunciation: null,
        source: 'example' as const,
        parentDanish: entry.danish,
        learningStatus: null,
        createdAt: entry.created_at,
      }))

    return [...manual, ...examples].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
  }, [entries])

  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('da-DK')
    return rows.filter((row) => {
      const matchesFilter = filter === 'all' || (filter === 'manual' ? row.source === 'manual' : row.source === 'example')
      if (!matchesFilter) return false
      if (!normalizedQuery) return true
      return row.danish.toLocaleLowerCase('da-DK').includes(normalizedQuery)
        || (row.translation || '').toLocaleLowerCase().includes(normalizedQuery)
        || (row.parentDanish || '').toLocaleLowerCase('da-DK').includes(normalizedQuery)
    })
  }, [rows, query, filter])

  async function removeSentence(entryId: string) {
    if (!confirm('Delete this sentence and its review history?')) return
    const { error } = await createClient().from('vocabulary_entries').delete().eq('id', entryId)
    if (!error) {
      setEntries((current) => current.filter((entry) => entry.id !== entryId))
      setCards((current) => current.filter((card) => card.entry_id !== entryId))
      setLinks((current) => current.filter((link) => link.a_id !== entryId && link.b_id !== entryId))
    }
  }

  const languageLabel = translationLanguage === 'ru' ? 'Russian' : translationLanguage === 'uk' ? 'Ukrainian' : 'English'

  return <>
    <header className="page-header words-header">
      <div>
        <span className="eyebrow">YOUR SENTENCES</span>
        <h1>Every sentence in one place.</h1>
        <p>Your own sentences stay in review. Examples from words are reference only.</p>
      </div>
      <div className="header-actions">
        <AddWordComposer compact translationLanguage={translationLanguage} />
      </div>
    </header>

    <div className="words-toolbar">
      <label className="search-box"><Search size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search Danish or ${languageLabel}…`} /></label>
      <div className="segmented">
        {([['all', 'All'], ['manual', 'Mine'], ['examples', 'Examples']] as const).map(([value, label]) => (
          <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}</button>
        ))}
      </div>
    </div>

    <section className="word-table-card sentence-table-card">
      <div className="word-table-head"><span>Danish</span><span>{languageLabel}</span><span>Source</span><span>Memory</span><span /></div>
      {visible.map((row) => {
        const card = row.source === 'manual' ? cardsByEntry.get(row.sourceEntryId) : undefined
        return <div className={`word-row sentence-row ${row.source === 'example' ? 'derived-sentence' : ''}`} key={row.id}>
          <div className="word-main">
            <span className="word-bubble small">{row.danish.slice(0, 1).toLocaleUpperCase('da-DK')}</span>
            <div>
              <strong>{row.danish}</strong>
              <small>{row.source === 'manual' ? row.pronunciation || 'No pronunciation' : `Example from ${row.parentDanish}`}</small>
              <SynonymChips neighbours={neighbours.get(row.sourceEntryId) || []} limit={2} onResolved={resolveLink} />
            </div>
          </div>
          <span>{row.translation || <em className="muted">Not added</em>}</span>
          <span className="sentence-source-cell">
            {row.source === 'manual'
              ? <span className="sentence-source manual"><PenLine size={13}/> Added directly</span>
              : <Link className="sentence-source" href={`/words/${row.sourceEntryId}`}><BookOpenText size={13}/> From “{row.parentDanish}”</Link>}
          </span>
          <div className="word-memory-cell">
            {row.source === 'manual' ? <>{card && <MemoryRing item={card} compact />}<span className={`status-chip ${row.learningStatus || 'new'}`}>{row.learningStatus || 'new'}</span></> : <span className="status-chip sentence-reference-chip">example</span>}
          </div>
          <div className="row-menu">
            {row.source === 'manual'
              ? <button className="icon-button danger" title="Delete" onClick={() => removeSentence(row.sourceEntryId)}><X size={16}/></button>
              : <Link className="icon-button" title="Open source word" href={`/words/${row.sourceEntryId}`}><BookOpenText size={16}/></Link>}
          </div>
          {/* Both row kinds open the same editor (D7). An example sentence has no entry of its
              own, so it opens the word that owns it — which is where its example is edited. */}
          <Link
            className="word-row-link"
            href={`/words/${row.sourceEntryId}`}
            aria-label={row.source === 'manual' ? `Open ${row.danish}` : `Open ${row.parentDanish}`}
          />
        </div>
      })}
      {!visible.length && <div className="empty-state tall">No sentences match this view.</div>}
    </section>
  </>
}
