'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bot, Check, CircleAlert, Loader2, Plus, Sparkles, WandSparkles, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Draft {
  danish: string
  pronunciation: string
  translation: string
  example_sentence: string
  example_translation: string
}

type EnrichableField = Exclude<keyof Draft, 'danish'>

type DuplicateEntry = { id: string; translation: string | null }

const enrichableFields: EnrichableField[] = [
  'pronunciation',
  'translation',
  'example_sentence',
  'example_translation',
]

const emptyDraft: Draft = {
  danish: '',
  pronunciation: '',
  translation: '',
  example_sentence: '',
  example_translation: '',
}

export function AddWordComposer({ compact = false, translationLanguage = 'ru' }: { compact?: boolean; translationLanguage?: 'ru' | 'en' | 'uk' }) {
  const router = useRouter()
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [aiLoading, setAiLoading] = useState<string | null>(null)
  const [aiSources, setAiSources] = useState<Partial<Record<EnrichableField, string>>>({})
  const [duplicate, setDuplicate] = useState<DuplicateEntry[] | null>(null)
  const [liveDuplicate, setLiveDuplicate] = useState<DuplicateEntry[]>([])
  const [allowDuplicate, setAllowDuplicate] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [usedAI, setUsedAI] = useState(false)
  const firstInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) setTimeout(() => firstInput.current?.focus(), 50)
  }, [open])

  useEffect(() => {
    if (!compact) return
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [compact])

  useEffect(() => {
    const danish = draft.danish.trim()
    setLiveDuplicate([])
    if (!danish) return

    let cancelled = false
    const timer = window.setTimeout(async () => {
      const { data } = await createClient()
        .from('vocabulary_entries')
        .select('id, translation')
        .ilike('danish', danish)
        .limit(5)

      if (!cancelled) setLiveDuplicate(data || [])
    }, 320)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [draft.danish])

  function patch(key: keyof Draft, value: string) {
    setDraft((d) => ({ ...d, [key]: value }))
    if (key === 'danish') {
      setDuplicate(null)
      setAllowDuplicate(false)
    } else {
      setAiSources((current) => {
        if (!current[key]) return current
        const next = { ...current }
        delete next[key]
        return next
      })
    }
    setNotice(null)
  }

  function clearDraft() {
    setDraft(emptyDraft)
    setAiSources({})
    setDuplicate(null)
    setLiveDuplicate([])
    setAllowDuplicate(false)
    setNotice(null)
    setUsedAI(false)
    window.setTimeout(() => firstInput.current?.focus(), 0)
  }

  async function normalizeBaseForm() {
    const original = draft.danish.trim()
    if (!original) {
      setNotice('Type a Danish word or phrase first.')
      return
    }

    setAiLoading('base-form')
    try {
      const res = await fetch('/api/ai/base-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ danish: original }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Could not find the base form')

      const baseForm = String(body.base_form || '').trim()
      if (!baseForm) throw new Error('AI returned an empty base form')

      if (baseForm === original) {
        setNotice('Already in base form.')
      } else {
        setDraft((current) => ({ ...current, danish: baseForm }))
        setDuplicate(null)
        setAllowDuplicate(false)
        setUsedAI(true)
        setNotice(`Base form: ${baseForm}`)
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not find the base form')
    } finally {
      setAiLoading(null)
    }
  }

  async function enrich(fields?: EnrichableField[]) {
    const sourceDanish = draft.danish.trim()
    if (!sourceDanish) {
      setNotice('Type a Danish word or phrase first.')
      return
    }

    const fullFill = !fields
    const requestedFields = fields ?? enrichableFields.filter((key) => {
      if (!draft[key].trim()) return true
      const source = aiSources[key]
      return !!source && source !== sourceDanish
    })

    if (!requestedFields.length) {
      setNotice('Everything is already up to date for this word.')
      return
    }

    const loadingKey = fullFill ? 'all' : requestedFields.join(',')
    setAiLoading(loadingKey)
    try {
      const res = await fetch('/api/ai/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft, fields: requestedFields }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'AI enrichment failed')

      setDraft((current) => {
        const next = { ...current }
        for (const key of requestedFields) {
          if (body[key]) next[key] = body[key]
        }
        return next
      })

      setAiSources((current) => {
        const next = { ...current }
        for (const key of requestedFields) {
          if (body[key]) next[key] = sourceDanish
        }
        return next
      })

      setUsedAI(true)
      setNotice(null)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'AI enrichment failed')
    } finally {
      setAiLoading(null)
    }
  }

  async function save() {
    if (!draft.danish.trim()) return setNotice('The Danish word is required.')
    if (!draft.translation.trim()) return setNotice('Add a translation or use AI to fill it.')
    setSaving(true)
    const supabase = createClient()

    if (!allowDuplicate) {
      const { data } = await supabase
        .from('vocabulary_entries')
        .select('id, translation')
        .ilike('danish', draft.danish.trim())
        .limit(5)
      if (data?.length) {
        setDuplicate(data)
        setSaving(false)
        return
      }
    }

    const { error } = await supabase.from('vocabulary_entries').insert({
      danish: draft.danish.trim(),
      pronunciation: draft.pronunciation.trim() || null,
      translation: draft.translation.trim(),
      example_sentence: draft.example_sentence.trim() || null,
      example_translation: draft.example_translation.trim() || null,
      ai_enriched: usedAI,
      familiarity: 0,
    })

    if (error) {
      setNotice(error.message)
      setSaving(false)
      return
    }

    setDraft(emptyDraft)
    setAiSources({})
    setDuplicate(null)
    setLiveDuplicate([])
    setAllowDuplicate(false)
    setUsedAI(false)
    setNotice('Saved. It is ready for review.')
    setSaving(false)
    if (compact) setOpen(false)
    router.refresh()
  }

  function keyDown(event: React.KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      void save()
    }
  }

  if (compact && !open) {
    return (
      <button className="quick-add-collapsed" onClick={() => setOpen(true)}>
        <span className="quick-plus"><Plus size={20} /></span>
        <span><strong>Add a word</strong><small>Capture it before it disappears</small></span>
        <span className="keyboard-hint">⌘ K</span>
      </button>
    )
  }

  const hasStaleAiFields = enrichableFields.some((key) => {
    const source = aiSources[key]
    return !!source && source !== draft.danish.trim()
  })

  const duplicateMeanings = [...new Set(liveDuplicate.map((item) => item.translation?.trim() || 'No translation'))]

  return (
    <section className="composer-card" onKeyDown={keyDown}>
      <div className="composer-heading">
        <div>
          <span className="eyebrow"><Sparkles size={14} /> QUICK CAPTURE</span>
          <h2>Add a Danish word</h2>
          <p>Manual first. AI only when you want it.</p>
        </div>
        {compact && <button className="icon-button" onClick={() => setOpen(false)} aria-label="Close"><X size={18} /></button>}
      </div>

      <div className="field-grid">
        <label className="field field-wide">
          <span>Danish word or phrase <AiMini label="Base form" loading={aiLoading === 'base-form'} onClick={normalizeBaseForm} /></span>
          <input ref={firstInput} value={draft.danish} onChange={(e) => patch('danish', e.target.value)} placeholder="fortryde" />
          {liveDuplicate.length > 0 && (
            <small style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#7557b5', fontSize: 10.5, fontWeight: 620, minWidth: 0 }}>
              <CircleAlert size={12} style={{ flex: '0 0 auto' }} />
              <span style={{ whiteSpace: 'nowrap' }}>Already saved</span>
              <span style={{ color: '#9a92a3', fontWeight: 520, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {duplicateMeanings.join(' · ')}</span>
            </small>
          )}
        </label>
        <label className="field">
          <span>Simplified pronunciation (Cyrillic) <AiMini loading={aiLoading === 'pronunciation'} onClick={() => enrich(['pronunciation'])} /></span>
          <input value={draft.pronunciation} onChange={(e) => patch('pronunciation', e.target.value)} placeholder="сюнес" />
        </label>
        <label className="field">
          <span>{translationLanguage === 'ru' ? 'Russian' : translationLanguage === 'en' ? 'English' : 'Ukrainian'} translation <AiMini loading={aiLoading === 'translation'} onClick={() => enrich(['translation'])} /></span>
          <input value={draft.translation} onChange={(e) => patch('translation', e.target.value)} placeholder={translationLanguage === 'ru' ? 'сожалеть' : translationLanguage === 'uk' ? 'шкодувати' : 'regret'} />
        </label>
        <label className="field field-wide">
          <span>Example sentence <AiMini loading={aiLoading === 'example_sentence,example_translation'} onClick={() => enrich(['example_sentence', 'example_translation'])} /></span>
          <textarea rows={2} value={draft.example_sentence} onChange={(e) => patch('example_sentence', e.target.value)} placeholder="Jeg fortryder mit valg." />
        </label>
        <label className="field field-wide">
          <span>Sentence translation</span>
          <input value={draft.example_translation} onChange={(e) => patch('example_translation', e.target.value)} placeholder={translationLanguage === 'ru' ? 'Я сожалею о своём выборе.' : translationLanguage === 'uk' ? 'Я шкодую про свій вибір.' : 'I regret my choice.'} />
        </label>
      </div>

      {duplicate && (
        <div className="duplicate-box">
          <div><strong>This word already exists.</strong><span>{duplicate.map((d) => d.translation || 'No translation').join(' · ')}</span></div>
          <div className="row-actions">
            <button className="soft-button" onClick={() => router.push(`/words?q=${encodeURIComponent(draft.danish)}`)}>Open existing</button>
            <button className="soft-button strong" onClick={() => { setAllowDuplicate(true); setDuplicate(null) }}>Add another meaning</button>
          </div>
        </div>
      )}

      {notice && <div className={`notice ${notice.startsWith('Saved') ? 'success' : ''}`}>{notice.startsWith('Saved') ? <Check size={16} /> : <Bot size={16} />}{notice}</div>}

      <div className="composer-actions">
        <div style={{ display: 'flex', gap: 8, flex: '1 1 auto' }}>
          <button className="ai-fill-button" disabled={!!aiLoading} onClick={() => enrich()} style={{ flex: '1 1 auto' }}>
            {aiLoading === 'all' ? <Loader2 className="spin" size={17} /> : <WandSparkles size={17} />}
            {hasStaleAiFields ? 'Regenerate for this word' : 'Fill missing with AI'}
          </button>
          <button className="soft-button" disabled={saving || !!aiLoading} onClick={clearDraft}>Clear</button>
        </div>
        <div className="save-wrap">
          <span className="keyboard-hint">⌘ Enter</span>
          <button className="primary-button" disabled={saving} onClick={save}>
            {saving ? <Loader2 className="spin" size={17} /> : <Plus size={17} />}
            Save word
          </button>
        </div>
      </div>
    </section>
  )
}

function AiMini({ loading, onClick, label = 'AI' }: { loading: boolean; onClick: () => void; label?: string }) {
  return (
    <button type="button" className="ai-mini" onClick={(e) => { e.preventDefault(); onClick() }} aria-label={label === 'AI' ? 'Fill with AI' : label}>
      {loading ? <Loader2 className="spin" size={12} /> : <Sparkles size={12} />} {label}
    </button>
  )
}
