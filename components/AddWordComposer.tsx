'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bot, Check, CircleAlert, Loader2, Plus, Sparkles, WandSparkles, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { inferDanishInputKind, inferEntryKind } from '@/lib/entry-kind'
import type { EntryKind } from '@/lib/types'

interface Draft {
  danish: string
  pronunciation: string
  translation: string
  example_sentence: string
  example_translation: string
}

type EnrichableField = Exclude<keyof Draft, 'danish'>
type DuplicateEntry = { id: string; translation: string | null }

const allEnrichableFields: EnrichableField[] = [
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
  const [entryKind, setEntryKind] = useState<EntryKind>('word')
  const [includeExample, setIncludeExample] = useState(true)
  const [examplePreferenceTouched, setExamplePreferenceTouched] = useState(false)
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
      const nextKind = inferEntryKind(value)
      setEntryKind(nextKind)
      if (!examplePreferenceTouched) {
        setIncludeExample(nextKind !== 'sentence')
      }
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

  function setExampleEnabled(enabled: boolean) {
    setIncludeExample(enabled)
    setExamplePreferenceTouched(true)

    if (!enabled) {
      setDraft((current) => ({ ...current, example_sentence: '', example_translation: '' }))
      setAiSources((current) => {
        const next = { ...current }
        delete next.example_sentence
        delete next.example_translation
        return next
      })
    }
  }

  function clearDraft() {
    setDraft(emptyDraft)
    setEntryKind('word')
    setIncludeExample(true)
    setExamplePreferenceTouched(false)
    setAiSources({})
    setDuplicate(null)
    setLiveDuplicate([])
    setAllowDuplicate(false)
    setNotice(null)
    setUsedAI(false)
    window.setTimeout(() => firstInput.current?.focus(), 0)
  }

  async function checkDanishForm() {
    const original = draft.danish.trim()
    if (!original) {
      setNotice('Type Danish text first.')
      return
    }

    const mode = inferDanishInputKind(original)
    setAiLoading('danish-check')
    try {
      const res = await fetch('/api/ai/base-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ danish: original, mode }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Could not check this Danish text')

      const result = String(body.result || '').trim()
      if (!result) throw new Error('AI returned empty Danish text')

      if (body.is_correct || result === original) {
        setNotice(mode === 'word' ? 'Already in base form.' : mode === 'phrase' ? 'Phrase looks good.' : 'Sentence looks correct.')
      } else {
        setDraft((current) => ({ ...current, danish: result }))
        const nextKind = inferEntryKind(result)
        setEntryKind(nextKind)
        if (!examplePreferenceTouched) setIncludeExample(nextKind !== 'sentence')
        setDuplicate(null)
        setAllowDuplicate(false)
        setUsedAI(true)
        setNotice(mode === 'word' ? `Base form: ${result}` : mode === 'phrase' ? `Normalized phrase: ${result}` : `Corrected sentence: ${result}`)
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not check this Danish text')
    } finally {
      setAiLoading(null)
    }
  }

  async function enrich(fields?: EnrichableField[]) {
    const sourceDanish = draft.danish.trim()
    if (!sourceDanish) {
      setNotice('Type Danish text first.')
      return
    }

    const activeFields = includeExample
      ? allEnrichableFields
      : allEnrichableFields.filter((key) => key !== 'example_sentence' && key !== 'example_translation')

    const fullFill = !fields
    const requestedFields = fields ?? activeFields.filter((key) => {
      if (!draft[key].trim()) return true
      const source = aiSources[key]
      return !!source && source !== sourceDanish
    })

    if (!requestedFields.length) {
      setNotice('Everything is already up to date for this text.')
      return
    }

    const loadingKey = fullFill ? 'all' : requestedFields.join(',')
    setAiLoading(loadingKey)

    try {
      const res = await fetch('/api/ai/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft,
          fields: requestedFields,
          entryKind,
          includeExample,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'AI enrichment failed')

      setDraft((current) => {
        const next = { ...current }
        for (const key of requestedFields) {
          if (typeof body[key] === 'string') next[key] = body[key]
        }
        if (!includeExample) {
          next.example_sentence = ''
          next.example_translation = ''
        }
        return next
      })

      setAiSources((current) => {
        const next = { ...current }
        for (const key of requestedFields) {
          if (typeof body[key] === 'string') next[key] = sourceDanish
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
    if (!draft.danish.trim()) return setNotice('Danish text is required.')
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
      example_sentence: includeExample ? draft.example_sentence.trim() || null : null,
      example_translation: includeExample ? draft.example_translation.trim() || null : null,
      entry_kind: entryKind,
      ai_enriched: usedAI,
      familiarity: 0,
    })

    if (error) {
      setNotice(error.message)
      setSaving(false)
      return
    }

    setDraft(emptyDraft)
    setEntryKind('word')
    setIncludeExample(true)
    setExamplePreferenceTouched(false)
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
        <span><strong>Add Danish</strong><small>Word, phrase, or sentence</small></span>
        <span className="keyboard-hint">⌘ K</span>
      </button>
    )
  }

  const activeFields = includeExample
    ? allEnrichableFields
    : allEnrichableFields.filter((key) => key !== 'example_sentence' && key !== 'example_translation')

  const hasStaleAiFields = activeFields.some((key) => {
    const source = aiSources[key]
    return !!source && source !== draft.danish.trim()
  })

  const duplicateMeanings = [...new Set(liveDuplicate.map((item) => item.translation?.trim() || 'No translation'))]
  const inputKind = inferDanishInputKind(draft.danish)
  const danishActionLabel = inputKind === 'word' ? 'Base form' : inputKind === 'phrase' ? 'Normalize phrase' : 'Check sentence'
  const inputKindLabel = inputKind === 'word' ? 'Word' : inputKind === 'phrase' ? 'Phrase' : 'Sentence detected'

  return (
    <section className="composer-card" onKeyDown={keyDown}>
      <div className="composer-heading">
        <div>
          <span className="eyebrow"><Sparkles size={14} /> QUICK CAPTURE</span>
          <h2>Add Danish</h2>
          <p>Word, phrase, or whole sentence. AI only when you want it.</p>
        </div>
        {compact && <button className="icon-button" onClick={() => setOpen(false)} aria-label="Close"><X size={18} /></button>}
      </div>

      <div className="field-grid">
        <label className="field field-wide">
          <span>
            <span>Danish word, phrase, or sentence</span>
            {draft.danish.trim() && <AiMini label={danishActionLabel} loading={aiLoading === 'danish-check'} onClick={checkDanishForm} />}
          </span>
          <input ref={firstInput} value={draft.danish} onChange={(e) => patch('danish', e.target.value)} placeholder="synes · helt sikker · Hvad kan du godt lide?" />
          <span style={{ minHeight: 16, justifyContent: 'flex-start', gap: 8 }}>
            {draft.danish.trim() && (
              <small style={{ color: inputKind === 'sentence' ? '#7557b5' : '#9a92a3', fontSize: 10, fontWeight: 650 }}>
                {inputKindLabel}
              </small>
            )}
            {liveDuplicate.length > 0 && (
              <small style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#7557b5', fontSize: 10.5, fontWeight: 620, minWidth: 0 }}>
                <CircleAlert size={12} style={{ flex: '0 0 auto' }} />
                <span style={{ whiteSpace: 'nowrap' }}>Already saved</span>
                <span style={{ color: '#9a92a3', fontWeight: 520, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {duplicateMeanings.join(' · ')}</span>
              </small>
            )}
          </span>
        </label>

        <label className="field">
          <span>Simplified pronunciation (Cyrillic) <AiMini loading={aiLoading === 'pronunciation'} onClick={() => enrich(['pronunciation'])} /></span>
          <input value={draft.pronunciation} onChange={(e) => patch('pronunciation', e.target.value)} placeholder="сюнес" />
        </label>

        <label className="field">
          <span>{translationLanguage === 'ru' ? 'Russian' : translationLanguage === 'en' ? 'English' : 'Ukrainian'} translation <AiMini loading={aiLoading === 'translation'} onClick={() => enrich(['translation'])} /></span>
          <input value={draft.translation} onChange={(e) => patch('translation', e.target.value)} placeholder={translationLanguage === 'ru' ? 'думать, считать' : translationLanguage === 'uk' ? 'думати, вважати' : 'think'} />
        </label>

        <div className="field field-wide">
          <span>
            <span>Separate example sentence</span>
            <button
              type="button"
              onClick={() => setExampleEnabled(!includeExample)}
              style={{
                border: 0,
                borderRadius: 999,
                padding: '4px 9px',
                background: includeExample ? '#eee9ff' : '#f1eff3',
                color: includeExample ? '#684dc7' : '#8d8793',
                fontSize: 10,
                fontWeight: 720,
                cursor: 'pointer',
              }}
            >
              {includeExample ? 'On' : 'Off'}
            </button>
          </span>
          {!includeExample && (
            <small style={{ color: '#9a92a3', fontSize: 10.5, lineHeight: 1.4 }}>
              Off — the saved Danish text is reviewed directly. Translation stays required.
            </small>
          )}
        </div>

        {includeExample && (
          <>
            <label className="field field-wide">
              <span>Example sentence <AiMini loading={aiLoading === 'example_sentence,example_translation'} onClick={() => enrich(['example_sentence', 'example_translation'])} /></span>
              <textarea rows={2} value={draft.example_sentence} onChange={(e) => patch('example_sentence', e.target.value)} placeholder="Jeg synes, det er godt." />
            </label>
            <label className="field field-wide">
              <span>Sentence translation</span>
              <input value={draft.example_translation} onChange={(e) => patch('example_translation', e.target.value)} placeholder={translationLanguage === 'ru' ? 'Я думаю, что это хорошо.' : translationLanguage === 'uk' ? 'Я думаю, що це добре.' : 'I think it is good.'} />
            </label>
          </>
        )}
      </div>

      {duplicate && (
        <div className="duplicate-box">
          <div><strong>This text already exists.</strong><span>{duplicate.map((d) => d.translation || 'No translation').join(' · ')}</span></div>
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
            {hasStaleAiFields ? 'Regenerate for this text' : 'Fill missing with AI'}
          </button>
          <button className="soft-button" disabled={saving || !!aiLoading} onClick={clearDraft}>Clear</button>
        </div>
        <div className="save-wrap">
          <span className="keyboard-hint">⌘ Enter</span>
          <button className="primary-button" disabled={saving} onClick={save}>
            {saving ? <Loader2 className="spin" size={17} /> : <Plus size={17} />}
            {entryKind === 'sentence' ? 'Save sentence' : inputKind === 'phrase' ? 'Save phrase' : 'Save word'}
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
