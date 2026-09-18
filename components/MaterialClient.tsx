'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { BookOpenText, Check, Loader2, Search, Sparkles, Waypoints, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  neighboursByEntry,
  withConfirmedLink,
  withoutLink,
  type EntryLinkRow,
  type LinkedEntryLabel,
} from '@/lib/entry-links'
import { canStartDiscovery, discoveryStartIndex, type DiscoveryRun } from '@/lib/discovery-run'
import { inferDanishInputKind } from '@/lib/entry-kind'
import { mergeSenses } from '@/lib/sense-merge'
import { parseSenses } from '@/lib/senses'
import type { EntrySense, LearningStatus, ReviewCard, VocabularyEntry } from '@/lib/types'
import { MemoryRing } from './MemoryRing'
import { SynonymChips } from './SynonymChips'
import { VocabularyGraph } from './VocabularyGraph'

export type MaterialKind = 'all' | 'words' | 'phrases' | 'sentences'
type StatusFilter = 'all' | LearningStatus

const kindFilters: [MaterialKind, string][] = [['all', 'All'], ['words', 'Words'], ['phrases', 'Phrases'], ['sentences', 'Sentences']]

/**
 * One row of the Material list. An entry is a saved word, phrase or sentence. A derived row is
 * the example sentence of a word: it has no entry of its own and opens the word that owns it.
 */
type MaterialRow =
  | { type: 'entry'; key: string; entry: VocabularyEntry; kind: 'word' | 'phrase' | 'sentence' }
  | { type: 'example'; key: string; entry: VocabularyEntry; danish: string; translation: string | null }

/** Words and phrases share `entry_kind = 'word'` in the database; the text tells them apart. */
function kindOf(entry: VocabularyEntry): 'word' | 'phrase' | 'sentence' {
  if (entry.entry_kind === 'sentence') return 'sentence'
  return inferDanishInputKind(entry.danish) === 'word' ? 'word' : 'phrase'
}

type EnrichField = 'pronunciation' | 'translation' | 'example_sentence' | 'example_translation'
type PreviewState = {
  word: VocabularyEntry
  proposal: Partial<Record<EnrichField, string>>
  selected: Record<EnrichField, boolean>
  /** The sense objects behind `proposal.translation`, kept so applying preserves sense ids. */
  senses: EntrySense[]
}

const fieldLabels: Record<EnrichField, string> = {
  pronunciation: 'Pronunciation',
  translation: 'Translation',
  example_sentence: 'Example sentence',
  example_translation: 'Example translation',
}

const allEnrichFields: EnrichField[] = ['pronunciation', 'translation', 'example_sentence', 'example_translation']

export function MaterialClient({
  initialWords,
  initialCards,
  initialLinks = [],
  initialQuery = '',
  initialKind = 'all',
  translationLanguage = 'ru',
}: {
  initialWords: VocabularyEntry[]
  initialCards: ReviewCard[]
  initialLinks?: EntryLinkRow[]
  initialQuery?: string
  initialKind?: MaterialKind
  translationLanguage?: 'ru' | 'en' | 'uk'
}): React.JSX.Element {
  const router = useRouter()
  const pathname = usePathname()
  const [words, setWords] = useState(initialWords)
  const [cards, setCards] = useState(initialCards)
  const [links, setLinks] = useState<EntryLinkRow[]>(initialLinks)
  const [query, setQuery] = useState(initialQuery)
  const [kind, setKind] = useState<MaterialKind>(initialKind)
  const [graphOpen, setGraphOpen] = useState(false)
  const [discovery, setDiscovery] = useState<DiscoveryRun | null>(null)
  /** How far the last discovery run got, so resuming does not re-run the entries it finished. */
  const discoveryCursor = useRef(0)
  const [status, setStatus] = useState<StatusFilter>('all')
  const [enriching, setEnriching] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [applyingPreview, setApplyingPreview] = useState(false)

  const cardsByEntry = useMemo(() => new Map(cards.map((card) => [card.entry_id, card])), [cards])

  // Every word is already in memory, so a chip costs one map lookup rather than a join — the
  // same reason `senses` lives on the entry row (plan §7, AGENTS.md §16).
  const neighbours = useMemo(
    () => neighboursByEntry(links, new Map<string, LinkedEntryLabel>(
      words.map((word) => [word.id, { id: word.id, danish: word.danish, translation: word.translation }]),
    )),
    [links, words],
  )

  function resolveLink(link: EntryLinkRow, action: 'confirm' | 'dismiss') {
    setLinks((current) => action === 'dismiss' ? withoutLink(current, link) : withConfirmedLink(current, link))
  }

  useEffect(() => setWords(initialWords), [initialWords])
  useEffect(() => setCards(initialCards), [initialCards])
  useEffect(() => setLinks(initialLinks), [initialLinks])

  function chooseKind(next: MaterialKind): void {
    setKind(next)
    // Kept in the URL so Back from an entry returns to the same filter, without a server round-trip.
    const params = new URLSearchParams(window.location.search)
    if (next === 'all') params.delete('kind')
    else params.set('kind', next)
    const search = params.toString()
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false })
  }

  const counts = useMemo(() => {
    const result = { all: words.length, words: 0, phrases: 0, sentences: 0 }
    for (const word of words) {
      const entryKind = kindOf(word)
      if (entryKind === 'word') result.words += 1
      else if (entryKind === 'phrase') result.phrases += 1
      else result.sentences += 1
    }
    return result
  }, [words])

  const visible = useMemo<MaterialRow[]>(() => {
    const q = query.trim()
    const matches = (...texts: (string | null | undefined)[]): boolean => !q || texts.some((text) => (text || '').toLocaleLowerCase('da-DK').includes(q.toLocaleLowerCase('da-DK')))
    const entries: MaterialRow[] = words
      .filter((word) => status === 'all' || word.learning_status === status)
      .map((word) => ({ type: 'entry' as const, key: word.id, entry: word, kind: kindOf(word) }))
      .filter((row) => kind === 'all' || `${row.kind}s` === kind)
      .filter((row) => matches(row.entry.danish, row.entry.translation))
    if (kind !== 'sentences') return entries
    // Sentences you added come first; the examples that belong to your words follow them.
    const examples: MaterialRow[] = status !== 'all' ? [] : words
      .filter((word) => word.entry_kind !== 'sentence' && word.example_sentence?.trim())
      .map((word) => ({ type: 'example' as const, key: `example:${word.id}`, entry: word, danish: word.example_sentence!.trim(), translation: word.example_translation?.trim() || null }))
      .filter((row) => matches(row.danish, row.translation, row.entry.danish))
    return [...entries, ...examples]
  }, [words, query, status, kind])


  function enrichFieldsFor(word: VocabularyEntry) {
    const includeExample = word.entry_kind !== 'sentence' || Boolean(word.example_sentence || word.example_translation)
    return includeExample ? allEnrichFields : allEnrichFields.slice(0, 2)
  }

  async function requestEnrichment(word: VocabularyEntry, fields: EnrichField[]) {
    const includeExample = fields.includes('example_sentence') || fields.includes('example_translation')
    const res = await fetch('/api/ai/enrich', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        draft: {
          danish: word.danish,
          pronunciation: word.pronunciation || '',
          translation: word.translation || '',
          example_sentence: word.example_sentence || '',
          example_translation: word.example_translation || '',
        },
        fields,
        entryKind: word.entry_kind || 'word',
        includeExample,
      }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error || 'AI enrichment failed')
    return body as Partial<Record<EnrichField, string>> & { senses?: unknown }
  }

  /**
   * Writing only `translation` lets the DB trigger re-derive `senses` from the string, which
   * mints a fresh id for every meaning and strands whatever FSRS state was keyed to the old
   * ones. Merging here keeps the ids the entry already had (D15).
   */
  function mergedSensesFor(word: VocabularyEntry, generated: EntrySense[]): EntrySense[] | null {
    if (!generated.length) return null
    return mergeSenses(parseSenses(word.senses), generated)
  }

  async function previewEnrichWord(word: VocabularyEntry) {
    setEnriching(word.id)
    try {
      const fields = enrichFieldsFor(word)
      const body = await requestEnrichment(word, fields)
      const proposal: Partial<Record<EnrichField, string>> = {}
      const selected: Record<EnrichField, boolean> = {
        pronunciation: false,
        translation: false,
        example_sentence: false,
        example_translation: false,
      }

      for (const field of fields) {
        const value = typeof body[field] === 'string' ? body[field]!.trim() : ''
        if (!value) continue
        proposal[field] = value
        selected[field] = value !== currentFieldValue(word, field)
      }

      if (!Object.keys(proposal).length) throw new Error('AI returned no enrichment suggestions.')
      setPreview({ word, proposal, selected, senses: parseSenses(body.senses) })
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'AI enrichment failed')
    } finally {
      setEnriching(null)
    }
  }

  async function applyPreview() {
    if (!preview) return
    const selectedFields = (Object.keys(preview.selected) as EnrichField[]).filter((field) => preview.selected[field] && preview.proposal[field] !== undefined)
    if (!selectedFields.length) {
      setPreview(null)
      return
    }

    setApplyingPreview(true)
    const patch: Record<string, string | boolean | null | EntrySense[]> = { ai_enriched: true }
    for (const field of selectedFields) patch[field] = preview.proposal[field] || null

    if (selectedFields.includes('translation')) {
      // Applying the translation also applies the part of speech and gender that came with it,
      // and keeps every sense id the entry already had.
      const merged = mergedSensesFor(preview.word, preview.senses)
      if (merged) patch.senses = merged
    }

    const { data, error } = await createClient()
      .from('vocabulary_entries')
      .update(patch)
      .eq('id', preview.word.id)
      .select('*')
      .single()

    if (!error && data) {
      setWords((current) => current.map((word) => word.id === data.id ? data : word))
      setPreview(null)
    } else if (error) {
      window.alert(error.message)
    }
    setApplyingPreview(false)
  }

  /**
   * Re-run synonym discovery across the whole vocabulary.
   *
   * Discovery normally fires once, right after an entry is saved, so a vocabulary that predates
   * it — or one whose edges were cleared — has no links and no way to get them. One call per
   * word, sequentially: the route is rate limited, and hammering it in parallel is the fastest
   * way to get every remaining call rejected.
   */
  async function findLinks(): Promise<void> {
    const targets = words.filter((word) => word.entry_kind !== 'sentence')
    // A stopped run is resumable — only a live one should swallow a second tap. Blocking on
    // `discovery` alone left the button permanently dead after the first interruption.
    if (!canStartDiscovery(discovery, targets.length)) return

    // Carry on where the last run stopped rather than paying for the same entries twice.
    const startAt = discoveryStartIndex(discovery, discoveryCursor.current, targets.length)
    setDiscovery({ done: startAt, total: targets.length })

    for (let index = startAt; index < targets.length; index += 1) {
      discoveryCursor.current = index
      let stopped: string | undefined

      // iOS suspends the page as soon as Ordly leaves the screen, so every request from here
      // would fail one after another. Stop on purpose and keep the place.
      if (typeof document !== 'undefined' && document.hidden) {
        stopped = 'Paused while Ordly was in the background.'
      } else {
        try {
          const response = await fetch('/api/synonyms/discover', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entryId: targets[index].id }),
          })
          if (response.status === 429) stopped = 'AI is rate limited. Try again in a minute.'
          else if (response.status === 503) stopped = 'Synonym discovery is unavailable right now.'
        } catch {
          stopped = 'Lost connection.'
        }
      }

      if (stopped) {
        setDiscovery({ done: index, total: targets.length, stopped })
        router.refresh()
        return
      }
      setDiscovery({ done: index + 1, total: targets.length })
    }

    discoveryCursor.current = 0
    setDiscovery(null)
    router.refresh()
  }

  async function removeWord(id: string) {
    if (!confirm('Delete this entry and its review history?')) return
    const { error } = await createClient().from('vocabulary_entries').delete().eq('id', id)
    if (!error) {
      setWords((current) => current.filter((word) => word.id !== id))
      setCards((current) => current.filter((card) => card.entry_id !== id))
      // The database cascades the edges; the local copy has to follow or a chip would point at
      // a word that is gone.
      setLinks((current) => current.filter((link) => link.a_id !== id && link.b_id !== id))
    }
  }

  return <>
    <header className="page-header words-header"><div><span className="eyebrow">YOUR MATERIAL</span><h1>Everything you are learning.</h1></div><div className="header-actions"><button className="graph-open-button" onClick={() => setGraphOpen(true)}><Waypoints size={16}/> Show graph</button></div></header>

    <div className="material-kinds segmented" role="tablist" aria-label="Show">
      {kindFilters.map(([value, label]) => <button key={value} role="tab" aria-selected={kind === value} className={kind === value ? 'active' : ''} onClick={() => chooseKind(value)}>{label}<span className="material-count">{counts[value]}</span></button>)}
    </div>

    <div className="words-toolbar">
      <label className="search-box"><Search size={17}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search Danish or ${translationLanguage === 'ru' ? 'Russian' : translationLanguage === 'uk' ? 'Ukrainian' : 'English'}…`} /></label>
      <div className="segmented">{(['all','new','learning','mastered'] as const).map((x) => <button key={x} className={status === x ? 'active' : ''} onClick={() => setStatus(x)}>{x[0].toUpperCase()+x.slice(1)}</button>)}</div>
    </div>

    <section className="word-table-card">
      <div className="word-table-head"><span>Danish</span><span>{translationLanguage === 'ru' ? 'Russian' : translationLanguage === 'uk' ? 'Ukrainian' : 'English'}</span><span>Example</span><span>Memory</span><span /></div>
      {visible.map((row, index) => {
        if (row.type === 'example') {
          const firstExample = index === 0 || visible[index - 1].type !== 'example'
          return <div className="word-row sentence-row derived-sentence" key={row.key} data-first-example={firstExample || undefined}>
            <div className="word-main"><span className="word-bubble small">{row.danish.slice(0, 1).toLocaleUpperCase('da-DK')}</span><div><strong>{row.danish}</strong><small>Example from {row.entry.danish}</small></div></div>
            <span>{row.translation || <em className="muted">Not added</em>}</span>
            <span className="sentence-source-cell"><Link className="sentence-source" href={`/words/${row.entry.id}`}><BookOpenText size={13}/> From “{row.entry.danish}”</Link></span>
            <div className="word-memory-cell"><span className="status-chip sentence-reference-chip">example</span></div>
            <div className="row-menu"><Link className="icon-button" title="Open source word" href={`/words/${row.entry.id}`}><BookOpenText size={16}/></Link></div>
            <Link className="word-row-link" href={`/words/${row.entry.id}`} aria-label={`Open ${row.entry.danish}`} />
          </div>
        }
        const word = row.entry
        const card = cardsByEntry.get(word.id)
        return <div className={`word-row${row.kind === 'sentence' ? ' sentence-row' : ''}`} key={row.key}>
          <div className="word-main"><span className="word-bubble small">{word.danish.slice(0, 1).toLocaleUpperCase('da-DK')}</span><div><strong>{word.danish}</strong><small>{kind === 'all' && row.kind !== 'word' && <span className={`material-kind-tag ${row.kind}`}>{row.kind}</span>}{word.pronunciation || 'No pronunciation'}</small><SynonymChips neighbours={neighbours.get(word.id) || []} limit={row.kind === 'sentence' ? 2 : 3} onResolved={resolveLink} /></div></div>
          <span>{word.translation || <em className="muted">Not added</em>}</span>
          <span className="example-cell">{row.kind === 'sentence' ? <em className="muted">Your sentence</em> : word.example_sentence || <em className="muted">No example yet</em>}</span>
          <div className="word-memory-cell">{card && <MemoryRing item={card} compact />}<span className={`status-chip ${word.learning_status}`}>{word.learning_status}</span></div>
          <div className="row-menu"><button className="icon-button" title="Preview AI enrichment" disabled={enriching === word.id} onClick={() => previewEnrichWord(word)}>{enriching === word.id ? <Loader2 className="spin" size={16}/> : <Sparkles size={16}/>}</button><button className="icon-button danger" title="Delete" onClick={() => removeWord(word.id)}><X size={16}/></button></div>
          {/* A real link rather than an onClick, so the row prefetches, middle-clicks, and
              triggers the app's route-loading feedback (AGENTS.md §5, §16). It is appended
              last and absolutely positioned: the mobile grid in globals.css places the other
              cells with :nth-child, and an extra leading child would shift every one of them. */}
          <Link className="word-row-link" href={`/words/${word.id}`} aria-label={`Open ${word.danish}`} />
        </div>
      })}
      {!visible.length && <div className="empty-state tall">Nothing matches this view.</div>}
    </section>

    {/* Near full screen: the graph is the only thing worth looking at while it is open. */}
    {graphOpen && <div className="graph-overlay" role="dialog" aria-modal="true" aria-label="Meaning graph">
      <div className="graph-overlay-head">
        <span className="eyebrow"><Waypoints size={14}/> MEANING GRAPH</span>
        <button className="icon-button" aria-label="Close the graph" onClick={() => setGraphOpen(false)}><X size={18}/></button>
      </div>
      <VocabularyGraph entries={words} links={links} discovery={discovery} onFindLinks={findLinks} />
    </div>}

    {preview && <div className="modal-backdrop" onMouseDown={() => !applyingPreview && setPreview(null)}>
      <section className="modal-card enrich-preview-card" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-title">
          <div><span className="eyebrow"><Sparkles size={14}/> AI PREVIEW</span><h2>Review changes for “{preview.word.danish}”</h2></div>
          <button className="icon-button" disabled={applyingPreview} onClick={() => setPreview(null)}><X size={18}/></button>
        </div>
        <p>Nothing is changed until you press Apply. Uncheck anything you want to keep as-is.</p>
        <div className="enrich-preview-list">
          {(Object.keys(preview.proposal) as EnrichField[]).map((field) => {
            const current = currentFieldValue(preview.word, field)
            const proposed = preview.proposal[field] || ''
            const changed = current !== proposed
            return <label className={`enrich-preview-row ${preview.selected[field] ? 'selected' : ''}`} key={field}>
              <input type="checkbox" checked={preview.selected[field]} disabled={!changed || applyingPreview} onChange={(event) => setPreview((state) => state ? { ...state, selected: { ...state.selected, [field]: event.target.checked } } : state)} />
              <div className="enrich-preview-copy">
                <strong>{fieldLabels[field]}</strong>
                {current && <span className="enrich-current">Current · {current}</span>}
                <span className="enrich-proposed"><Sparkles size={12}/> {proposed}</span>
                {!changed && <small>Already the same</small>}
              </div>
            </label>
          })}
        </div>
        <div className="modal-footer">
          <span><Check size={15}/> Apply only selected fields.</span>
          <div className="row-actions">
            <button className="soft-button" disabled={applyingPreview} onClick={() => setPreview(null)}>Cancel</button>
            <button className="primary-button" disabled={applyingPreview || !(Object.keys(preview.selected) as EnrichField[]).some((field) => preview.selected[field])} onClick={applyPreview}>{applyingPreview ? <Loader2 className="spin" size={17}/> : <Check size={17}/>} Apply selected</button>
          </div>
        </div>
      </section>
    </div>}

  </>
}

function currentFieldValue(word: VocabularyEntry, field: EnrichField) {
  return String(word[field] || '').trim()
}
