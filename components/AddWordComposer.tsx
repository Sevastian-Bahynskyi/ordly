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
type ExampleCheckStatus = 'idle' | 'correct' | 'suggestion'

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
  const [exampleSuggestion, setExampleSuggestion] = useState<string | null>(null)
  const [exampleCheckStatus, setExampleCheckStatus] = useState<ExampleCheckStatus>('idle')
  const firstInput = useRef<HTMLInputElement>(null)
  const exampleSentenceDirty = useRef(false)
  const latestExampleSentence = useRef('')

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

  function resetExampleCheck() {
    setExampleSuggestion(null)
    setExampleCheckStatus('idle')
  }

  function patch(key: keyof Draft, value: string) {
    if (key === 'danish') {
      const nextKind = inferEntryKind(value)
      setDraft((current) => nextKind === 'sentence'
        ? { ...current, danish: value, example_sentence: '', example_translation: '' }
        : { ...current, danish: value })
      setEntryKind(nextKind)

      if (nextKind === 'sentence') {
        exampleSentenceDirty.current = false
        latestExampleSentence.current = ''
        resetExampleCheck()
        setIncludeExample(false)
        setAiSources((current) => {
          const next = { ...current }
          delete next.example_sentence
          delete next.example_translation
          return next
        })
      } else if (!examplePreferenceTouched) {
        setIncludeExample(true)
      }

      setDuplicate(null)
      setAllowDuplicate(false)
    } else {
      if (key === 'example_sentence') {
        latestExampleSentence.current = value
        resetExampleCheck()
      }
      setDraft((current) => ({ ...current, [key]: value }))
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
    if (entryKind === 'sentence') return

    setIncludeExample(enabled)
    setExamplePreferenceTouched(true)

    if (!enabled) {
      exampleSentenceDirty.current = false
      latestExampleSentence.current = ''
      resetExampleCheck()
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
    exampleSentenceDirty.current = false
    latestExampleSentence.current = ''
    resetExampleCheck()
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
        patch('danish', result)
        setUsedAI(true)
        setNotice(mode === 'word' ? `Base form: ${result}` : mode === 'phrase' ? `Normalized phrase: ${result}` : `Corrected sentence: ${result}`)
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not check this Danish text')
    } finally {
      setAiLoading(null)
    }
  }

  async function checkExampleSentence() {
    const sourceSentence = draft.example_sentence.trim()
    if (!sourceSentence) return

    setAiLoading('example-check')
    try {
      const res = await fetch('/api/ai/check-example', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sentence: sourceSentence }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Could not check this example sentence')

      if (latestExampleSentence.current.trim() !== sourceSentence) return

      const corrected = String(body.corrected_sentence || '').trim()
      const translation = String(body.translation || '').trim()

      if (translation) {
        setDraft((current) => current.example_sentence.trim() === sourceSentence
          ? { ...current, example_translation: translation }
          : current)
      }

      if (!body.is_correct && corrected && corrected !== sourceSentence) {
        setExampleSuggestion(corrected)
        setExampleCheckStatus('suggestion')
      } else {
        setExampleSuggestion(null)
        setExampleCheckStatus('correct')
      }

      setAiSources((current) => ({ ...current, example_translation: draft.danish.trim() }))
      setUsedAI(true)
      setNotice(null)
    } catch (error) {
      if (latestExampleSentence.current.trim() === sourceSentence) {
        setNotice(error instanceof Error ? error.message : 'Could not check this example sentence')
      }
    } finally {
      setAiLoading((current) => current === 'example-check' ? null : current)
    }
  }

  function applyExampleSuggestion() {
    if (!exampleSuggestion) return
    const corrected = exampleSuggestion
    latestExampleSentence.current = corrected
    exampleSentenceDirty.current = false
    setDraft((current) => ({ ...current, example_sentence: corrected }))
    setExampleSuggestion(null)
    setExampleCheckStatus('correct')
    setAiSources((current) => ({ ...current, example_sentence: draft.danish.trim() }))
    setUsedAI(true)
  }

  async function enrich(fields?: EnrichableField[]) {
    const sourceDanish = draft.danish.trim()
    if (!sourceDanish) {
      setNotice('Type Danish text first.')
      return
    }

    const effectiveIncludeExample = entryKind !== 'sentence' && includeExample
    const activeFields: EnrichableField[] = entryKind === 'sentence'
      ? ['pronunciation', 'translation']
      : effectiveIncludeExample
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
          includeExample: effectiveIncludeExample,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'AI enrichment failed')

      setDraft((current) => {
        const next = { ...current }
        for (const key of requestedFields) {
          if (typeof body[key] === 'string') next[key] = body[key]
        }
        if (!effectiveIncludeExample) {
          next.example_sentence = ''
          next.example_translation = ''
        }
        return next
      })

      if (requestedFields.includes('example_sentence') && typeof body.example_sentence === 'string') {
        latestExampleSentence.current = body.example_sentence
        resetExampleCheck()
      }

      setAiSources((current) => {
        const next = { ...current }
        for (const key of requestedFields) {
          if (typeof body[key] === 'string') next[key] = sourceDanish
        }
        return next
      })

      if (requestedFields.includes('example_sentence') || requestedFields.includes('example_translation')) {
        exampleSentenceDirty.current = false
      }
      setUsedAI(true)
      setNotice(null)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'AI enrichment failed')
    } finally {
      setAiLoading(null)
    }
  }

  async function save() {
    if (aiLoading) return setNotice('Wait for the AI check to finish.')
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

    const storeExample = entryKind !== 'sentence' && includeExample
    const { data: savedEntry, error } = await supabase.from('vocabulary_entries').insert({
      danish: draft.danish.trim(),
      pronunciation: draft.pronunciation.trim() || null,
      translation: draft.translation.trim(),
      example_sentence: storeExample ? draft.example_sentence.trim() || null : null,
      example_translation: storeExample ? draft.example_translation.trim() || null : null,
      entry_kind: entryKind,
      ai_enriched: usedAI,
      familiarity: 0,
    }).select('id, entry_kind').single()

    if (error) {
      setNotice(error.message)
      setSaving(false)
      return
    }

    if (savedEntry?.id && savedEntry.entry_kind !== 'sentence') {
      void fetch('/api/ai/icon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId: savedEntry.id }),
      }).catch(() => {})
    }

    exampleSentenceDirty.current = false
    latestExampleSentence.current = ''
    resetExampleCheck()
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

    router.refresh()
    window.setTimeout(() => firstInput.current?.focus(), 0)
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

  const effectiveIncludeExample = entryKind !== 'sentence' && includeExample
  const activeFields: EnrichableField[] = entryKind === 'sentence'
    ? ['pronunciation', 'translation']
    : effectiveIncludeExample
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
  const languageLabel = translationLanguage === 'ru' ? 'Russian' : translationLanguage === 'en' ? 'English' : 'Ukrainian'
  const translationLabel = entryKind === 'sentence' ? 'Sentence translation' : `${languageLabel} translation`
  const translationPlaceholder = entryKind === 'sentence'
    ? translationLanguage === 'ru' ? 'Как дела?' : translationLanguage === 'uk' ? 'Як справи?' : 'How are you?'
    : translationLanguage === 'ru' ? 'думать, считать' : translationLanguage === 'uk' ? 'думати, вважати' : 'think'

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
          <span>{translationLabel} <AiMini loading={aiLoading === 'translation'} onClick={() => enrich(['translation'])} /></span>
          <input value={draft.translation} onChange={(e) => patch('translation', e.target.value)} placeholder={translationPlaceholder} />
        </label>

        {entryKind !== 'sentence' && (
          <>
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
                  <span>
                    <span>Example sentence</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {aiLoading === 'example-check' && <small style={{ color: '#8e86a0', display: 'flex', alignItems: 'center', gap: 4 }}><Loader2 className="spin" size={11} /> Checking Danish…</small>}
                      <AiMini loading={aiLoading === 'example_sentence,example_translation'} onClick={() => enrich(['example_sentence', 'example_translation'])} />
                    </span>
                  </span>
                  <textarea
                    rows={2}
                    value={draft.example_sentence}
                    onChange={(e) => {
                      exampleSentenceDirty.current = true
                      patch('example_sentence', e.target.value)
                    }}
                    onBlur={(e) => {
                      const nextTarget = e.relatedTarget as HTMLElement | null
                      if (!exampleSentenceDirty.current || !draft.example_sentence.trim() || nextTarget?.closest('.ai-mini') || nextTarget?.closest('.example-correction-action')) return
                      exampleSentenceDirty.current = false
                      void checkExampleSentence()
                    }}
                    placeholder="Jeg synes, det er godt."
                  />
                  {exampleCheckStatus === 'correct' && !exampleSuggestion && (
                    <small style={{ color: '#4f8a68', display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 650 }}>
                      <Check size={12} /> Grammar and spelling look good.
                    </small>
                  )}
                  {exampleSuggestion && (
                    <div style={{ border: '1px solid #e5def8', background: '#faf8ff', borderRadius: 12, padding: '9px 10px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                      <small style={{ color: '#8b8394', fontSize: 9.5, fontWeight: 750, letterSpacing: '.06em', textTransform: 'uppercase' }}>Suggested correction</small>
                      <strong style={{ color: '#3c3545', fontSize: 12.5, lineHeight: 1.45 }}>{exampleSuggestion}</strong>
                      <div style={{ display: 'flex', gap: 7 }}>
                        <button type="button" className="soft-button strong example-correction-action" style={{ padding: '6px 9px', fontSize: 10.5 }} onClick={(e) => { e.preventDefault(); applyExampleSuggestion() }}><Check size={13} /> Use correction</button>
                        <button type="button" className="soft-button example-correction-action" style={{ padding: '6px 9px', fontSize: 10.5 }} onClick={(e) => { e.preventDefault(); setExampleSuggestion(null); setExampleCheckStatus('idle') }}>Keep mine</button>
                      </div>
                    </div>
                  )}
                </label>
                <label className="field field-wide">
                  <span>Sentence translation</span>
                  <input value={draft.example_translation} onChange={(e) => patch('example_translation', e.target.value)} placeholder={translationLanguage === 'ru' ? 'Я думаю, что это хорошо.' : translationLanguage === 'uk' ? 'Я думаю, що це добре.' : 'I think it is good.'} />
                </label>
              </>
            )}
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
          <button className="primary-button" disabled={saving || !!aiLoading} onClick={save}>
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
