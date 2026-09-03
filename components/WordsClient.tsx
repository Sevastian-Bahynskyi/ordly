'use client'

import { useMemo, useState } from 'react'
import { Bot, Check, Loader2, Plus, Search, Sparkles, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { ReviewCard, VocabularyEntry } from '@/lib/types'
import { AddWordComposer } from './AddWordComposer'
import { MemoryRing } from './MemoryRing'

type EnrichField = 'pronunciation' | 'translation' | 'example_sentence' | 'example_translation'
type PreviewState = {
  word: VocabularyEntry
  proposal: Partial<Record<EnrichField, string>>
  selected: Record<EnrichField, boolean>
}

const fieldLabels: Record<EnrichField, string> = {
  pronunciation: 'Pronunciation',
  translation: 'Translation',
  example_sentence: 'Example sentence',
  example_translation: 'Example translation',
}

const allEnrichFields: EnrichField[] = ['pronunciation', 'translation', 'example_sentence', 'example_translation']

export function WordsClient({
  initialWords,
  initialCards,
  initialQuery = '',
  translationLanguage = 'ru',
}: {
  initialWords: VocabularyEntry[]
  initialCards: ReviewCard[]
  initialQuery?: string
  translationLanguage?: 'ru' | 'en' | 'uk'
}) {
  const [words, setWords] = useState(initialWords)
  const [cards, setCards] = useState(initialCards)
  const [query, setQuery] = useState(initialQuery)
  const [status, setStatus] = useState<'all' | 'new' | 'learning' | 'mastered'>('all')
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [bulkLoading, setBulkLoading] = useState(false)
  const [enriching, setEnriching] = useState<string | null>(null)
  const [enrichingAll, setEnrichingAll] = useState(false)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [applyingPreview, setApplyingPreview] = useState(false)

  const cardsByEntry = useMemo(() => new Map(cards.map((card) => [card.entry_id, card])), [cards])

  const visible = useMemo(() => words.filter((word) => {
    const matchesQ = !query || word.danish.toLocaleLowerCase('da-DK').includes(query.toLocaleLowerCase('da-DK')) || (word.translation || '').toLocaleLowerCase().includes(query.toLocaleLowerCase())
    const matchesStatus = status === 'all' || word.learning_status === status
    return matchesQ && matchesStatus
  }), [words, query, status])

  async function bulkImport() {
    const items = bulkText.split(/\n|,/).map((x) => x.trim()).filter(Boolean)
    if (!items.length) return
    setBulkLoading(true)
    const supabase = createClient()
    const existing = new Set(words.map((x) => x.danish.toLocaleLowerCase('da-DK')))
    const rows = items.filter((x) => !existing.has(x.toLocaleLowerCase('da-DK'))).map((danish) => ({ danish, translation: null, familiarity: 0 }))
    if (rows.length) {
      const { data } = await supabase.from('vocabulary_entries').insert(rows).select('*')
      if (data?.length) {
        setWords((current) => [...data, ...current])
        const { data: newCards } = await supabase.from('review_cards').select('*').in('entry_id', data.map((word) => word.id))
        if (newCards?.length) setCards((current) => [...newCards, ...current])
      }
    }
    setBulkLoading(false)
    setBulkText('')
    setBulkOpen(false)
  }

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
    return body as Partial<Record<EnrichField, string>>
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
      setPreview({ word, proposal, selected })
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
    const patch: Record<string, string | boolean | null> = { ai_enriched: true }
    for (const field of selectedFields) patch[field] = preview.proposal[field] || null

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

  async function enrichMissing() {
    const missing = words.filter((word) => {
      if (!word.pronunciation || !word.translation) return true
      return word.entry_kind !== 'sentence' && (!word.example_sentence || !word.example_translation)
    })
    if (!missing.length) return

    setEnrichingAll(true)
    try {
      for (const word of missing) {
        const fields = enrichFieldsFor(word).filter((field) => !currentFieldValue(word, field))
        if (!fields.length) continue
        const body = await requestEnrichment(word, fields)
        const patch: Record<string, string | boolean> = { ai_enriched: true }
        for (const field of fields) {
          const value = typeof body[field] === 'string' ? body[field]!.trim() : ''
          if (value) patch[field] = value
        }
        const { data } = await createClient().from('vocabulary_entries').update(patch).eq('id', word.id).select('*').single()
        if (data) setWords((current) => current.map((item) => item.id === data.id ? data : item))
      }
    } finally {
      setEnrichingAll(false)
    }
  }

  async function removeWord(id: string) {
    if (!confirm('Delete this word and its review history?')) return
    const { error } = await createClient().from('vocabulary_entries').delete().eq('id', id)
    if (!error) {
      setWords((current) => current.filter((word) => word.id !== id))
      setCards((current) => current.filter((card) => card.entry_id !== id))
    }
  }

  return <>
    <header className="page-header words-header"><div><span className="eyebrow">YOUR WORDS</span><h1>Everything you are learning.</h1><p>No folders. No taxonomy. Just your Danish.</p></div><div className="header-actions"><button className="soft-button" disabled={enrichingAll} onClick={enrichMissing}>{enrichingAll ? <Loader2 className="spin" size={15}/> : <Sparkles size={15}/>} Enrich missing</button><button className="soft-button" onClick={() => setBulkOpen(true)}>Bulk add</button><AddWordComposer compact translationLanguage={translationLanguage} /></div></header>

    <div className="words-toolbar">
      <label className="search-box"><Search size={17}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search Danish or ${translationLanguage === 'ru' ? 'Russian' : translationLanguage === 'uk' ? 'Ukrainian' : 'English'}…`} /></label>
      <div className="segmented">{(['all','new','learning','mastered'] as const).map((x) => <button key={x} className={status === x ? 'active' : ''} onClick={() => setStatus(x)}>{x[0].toUpperCase()+x.slice(1)}</button>)}</div>
    </div>

    <section className="word-table-card">
      <div className="word-table-head"><span>Danish</span><span>{translationLanguage === 'ru' ? 'Russian' : translationLanguage === 'uk' ? 'Ukrainian' : 'English'}</span><span>Example</span><span>Memory</span><span /></div>
      {visible.map((word) => {
        const card = cardsByEntry.get(word.id)
        return <div className="word-row" key={word.id}>
          <div className="word-main"><span className="word-bubble small">{word.danish.slice(0,1).toUpperCase()}</span><div><strong>{word.danish}</strong><small>{word.pronunciation || 'No pronunciation'}</small></div></div>
          <span>{word.translation || <em className="muted">Not added</em>}</span>
          <span className="example-cell">{word.example_sentence || <em className="muted">No example yet</em>}</span>
          <div className="word-memory-cell">{card && <MemoryRing item={card} compact />}<span className={`status-chip ${word.learning_status}`}>{word.learning_status}</span></div>
          <div className="row-menu"><button className="icon-button" title="Preview AI enrichment" disabled={enriching === word.id} onClick={() => previewEnrichWord(word)}>{enriching === word.id ? <Loader2 className="spin" size={16}/> : <Sparkles size={16}/>}</button><button className="icon-button danger" title="Delete" onClick={() => removeWord(word.id)}><X size={16}/></button></div>
        </div>
      })}
      {!visible.length && <div className="empty-state tall">No words match this view.</div>}
    </section>

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

    {bulkOpen && <div className="modal-backdrop" onMouseDown={() => setBulkOpen(false)}><section className="modal-card" onMouseDown={(e) => e.stopPropagation()}><div className="modal-title"><div><span className="eyebrow"><Plus size={14}/> BULK CAPTURE</span><h2>Paste words. Enrich later.</h2></div><button className="icon-button" onClick={() => setBulkOpen(false)}><X size={18}/></button></div><p>One Danish word or phrase per line. Existing words are skipped.</p><textarea className="bulk-textarea" autoFocus rows={10} value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder={'fortryde\nhyggelig\nat tage sig af'} /><div className="modal-footer"><span><Bot size={15}/> Raw import keeps this instant.</span><button className="primary-button" disabled={bulkLoading} onClick={bulkImport}>{bulkLoading ? <Loader2 className="spin" size={17}/> : <Plus size={17}/>}Import raw</button></div></section></div>}
  </>
}

function currentFieldValue(word: VocabularyEntry, field: EnrichField) {
  return String(word[field] || '').trim()
}
