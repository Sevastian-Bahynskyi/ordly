'use client'

import { useMemo, useState } from 'react'
import { Bot, Loader2, Plus, Search, Sparkles, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { VocabularyEntry } from '@/lib/types'
import { AddWordComposer } from './AddWordComposer'

export function WordsClient({ initialWords, initialQuery = '', translationLanguage = 'ru' }: { initialWords: VocabularyEntry[]; initialQuery?: string; translationLanguage?: 'ru' | 'en' | 'uk' }) {
  const [words, setWords] = useState(initialWords)
  const [query, setQuery] = useState(initialQuery)
  const [status, setStatus] = useState<'all' | 'new' | 'learning' | 'mastered'>('all')
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [bulkLoading, setBulkLoading] = useState(false)
  const [enriching, setEnriching] = useState<string | null>(null)
  const [enrichingAll, setEnrichingAll] = useState(false)

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
      if (data) setWords((current) => [...data, ...current])
    }
    setBulkLoading(false); setBulkText(''); setBulkOpen(false)
  }

  async function enrichWord(word: VocabularyEntry) {
    setEnriching(word.id)
    try {
      const res = await fetch('/api/ai/enrich', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft: { danish: word.danish, pronunciation: word.pronunciation || '', translation: word.translation || '', example_sentence: word.example_sentence || '', example_translation: word.example_translation || '' } }) })
      const body = await res.json()
      if (!res.ok) return
      const patch = { pronunciation: body.pronunciation || word.pronunciation, translation: body.translation || word.translation, example_sentence: body.example_sentence || word.example_sentence, example_translation: body.example_translation || word.example_translation, ai_enriched: true }
      const { data } = await createClient().from('vocabulary_entries').update(patch).eq('id', word.id).select('*').single()
      if (data) setWords((current) => current.map((x) => x.id === word.id ? data : x))
    } finally { setEnriching(null) }
  }

  async function enrichMissing() {
    const missing = words.filter((word) => !word.translation || !word.example_sentence || !word.pronunciation)
    if (!missing.length) return
    setEnrichingAll(true)
    for (const word of missing) await enrichWord(word)
    setEnrichingAll(false)
  }

  async function removeWord(id: string) {
    if (!confirm('Delete this word and its review history?')) return
    const { error } = await createClient().from('vocabulary_entries').delete().eq('id', id)
    if (!error) setWords((current) => current.filter((x) => x.id !== id))
  }

  return <>
    <header className="page-header words-header"><div><span className="eyebrow">YOUR WORDS</span><h1>Everything you are learning.</h1><p>No folders. No taxonomy. Just your Danish.</p></div><div className="header-actions"><button className="soft-button" disabled={enrichingAll} onClick={enrichMissing}>{enrichingAll ? <Loader2 className="spin" size={15}/> : <Sparkles size={15}/>} Enrich missing</button><button className="soft-button" onClick={() => setBulkOpen(true)}>Bulk add</button><AddWordComposer compact translationLanguage={translationLanguage} /></div></header>

    <div className="words-toolbar">
      <label className="search-box"><Search size={17}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search Danish or ${translationLanguage === 'ru' ? 'Russian' : translationLanguage === 'uk' ? 'Ukrainian' : 'English'}…`} /></label>
      <div className="segmented">{(['all','new','learning','mastered'] as const).map((x) => <button key={x} className={status === x ? 'active' : ''} onClick={() => setStatus(x)}>{x[0].toUpperCase()+x.slice(1)}</button>)}</div>
    </div>

    <section className="word-table-card">
      <div className="word-table-head"><span>Danish</span><span>{translationLanguage === 'ru' ? 'Russian' : translationLanguage === 'uk' ? 'Ukrainian' : 'English'}</span><span>Example</span><span>Status</span><span /></div>
      {visible.map((word) => <div className="word-row" key={word.id}>
        <div className="word-main"><span className="word-bubble small">{word.danish.slice(0,1).toUpperCase()}</span><div><strong>{word.danish}</strong><small>{word.pronunciation || 'No pronunciation'}</small></div></div>
        <span>{word.translation || <em className="muted">Not added</em>}</span>
        <span className="example-cell">{word.example_sentence || <em className="muted">No example yet</em>}</span>
        <span><span className={`status-chip ${word.learning_status}`}>{word.learning_status}</span></span>
        <div className="row-menu"><button className="icon-button" title="AI enrich" disabled={enriching === word.id} onClick={() => enrichWord(word)}>{enriching === word.id ? <Loader2 className="spin" size={16}/> : <Sparkles size={16}/>}</button><button className="icon-button danger" title="Delete" onClick={() => removeWord(word.id)}><X size={16}/></button></div>
      </div>)}
      {!visible.length && <div className="empty-state tall">No words match this view.</div>}
    </section>

    {bulkOpen && <div className="modal-backdrop" onMouseDown={() => setBulkOpen(false)}><section className="modal-card" onMouseDown={(e) => e.stopPropagation()}><div className="modal-title"><div><span className="eyebrow"><Plus size={14}/> BULK CAPTURE</span><h2>Paste words. Enrich later.</h2></div><button className="icon-button" onClick={() => setBulkOpen(false)}><X size={18}/></button></div><p>One Danish word or phrase per line. Existing words are skipped.</p><textarea className="bulk-textarea" autoFocus rows={10} value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder={'fortryde\nhyggelig\nat tage sig af'} /><div className="modal-footer"><span><Bot size={15}/> Raw import keeps this instant.</span><button className="primary-button" disabled={bulkLoading} onClick={bulkImport}>{bulkLoading ? <Loader2 className="spin" size={17}/> : <Plus size={17}/>}Import raw</button></div></section></div>}
  </>
}
