'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, Bot, Check, CircleAlert, Loader2, Plus, RotateCcw, Sparkles, Trash2, WandSparkles, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { inferDanishInputKind, inferEntryKind } from '@/lib/entry-kind'
import {
  activeSenses,
  createSense,
  parseSenses,
  PART_OF_SPEECH_LABELS,
  PARTS_OF_SPEECH,
  splitTranslationIntoSenses,
  translationFromSenses,
} from '@/lib/senses'
import type { EntryKind, EntrySense, NounGender, PartOfSpeech } from '@/lib/types'

interface Draft {
  danish: string
  pronunciation: string
  /**
   * Derived from `senses` and never edited directly. It stays on the draft so the existing
   * enrich field plumbing (`EnrichableField`, per-field mini buttons, fill-missing) is
   * unchanged, and so the insert keeps writing the denormalized column the DB expects.
   */
  translation: string
  senses: EntrySense[]
  example_sentence: string
  example_translation: string
}

type EnrichableField = Exclude<keyof Draft, 'danish' | 'senses'>
type DuplicateEntry = { id: string; translation: string | null }
type ExampleCheckStatus = 'idle' | 'correct' | 'suggestion'

/** Everything a regenerate overwrites, kept so a single Undo can put it back. */
interface DraftSnapshot {
  draft: Draft
  exampleSuggestion: string | null
  exampleCheckStatus: ExampleCheckStatus
  usedAI: boolean
}

const allEnrichableFields: EnrichableField[] = [
  'pronunciation',
  'translation',
  'example_sentence',
  'example_translation',
]

/** Fields the AI may fill for this entry kind. Sentences never gain example fields. */
function enrichableFieldsFor(entryKind: EntryKind, includeExample: boolean): EnrichableField[] {
  if (entryKind === 'sentence') return ['pronunciation', 'translation']
  if (!includeExample) return allEnrichableFields.filter((key) => key !== 'example_sentence' && key !== 'example_translation')
  return allEnrichableFields
}

function blankDraft(): Draft {
  return {
    danish: '',
    pronunciation: '',
    translation: '',
    senses: [createSense('')],
    example_sentence: '',
    example_translation: '',
  }
}

/** senses are the source of truth; translation is recomputed from them on every change. */
function withSenses(draft: Draft, senses: EntrySense[]): Draft {
  const next = senses.length ? senses : [createSense('')]
  return { ...draft, senses: next, translation: translationFromSenses(next) }
}

export function AddWordComposer({ compact = false, translationLanguage = 'ru' }: { compact?: boolean; translationLanguage?: 'ru' | 'en' | 'uk' }) {
  const router = useRouter()
  const [draft, setDraft] = useState<Draft>(blankDraft)
  const [entryKind, setEntryKind] = useState<EntryKind>('word')
  const [includeExample, setIncludeExample] = useState(true)
  const [examplePreferenceTouched, setExamplePreferenceTouched] = useState(false)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [aiLoading, setAiLoading] = useState<string | null>(null)
  const [undoSnapshot, setUndoSnapshot] = useState<DraftSnapshot | null>(null)
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

  function patch(key: 'danish' | EnrichableField, value: string) {
    if (key === 'danish') {
      const nextKind = inferEntryKind(value)
      setDraft((current) => {
        if (nextKind !== 'sentence') return { ...current, danish: value }
        // A sentence has exactly one meaning. Fold any extra sense rows back into one
        // rather than leaving a comma-split sentence translation behind.
        const active = activeSenses(current.senses)
        const collapsed = active.length > 1
          ? [createSense(translationFromSenses(active), { source: active[0].source })]
          : current.senses
        return withSenses({ ...current, danish: value, example_sentence: '', example_translation: '' }, collapsed)
      })
      setEntryKind(nextKind)

      if (nextKind === 'sentence') {
        exampleSentenceDirty.current = false
        latestExampleSentence.current = ''
        resetExampleCheck()
        setIncludeExample(false)
      } else if (!examplePreferenceTouched) {
        setIncludeExample(true)
      }

      // The snapshot belongs to the previous Danish text; restoring it here would
      // silently revert what the user just typed.
      setUndoSnapshot(null)
      setDuplicate(null)
      setAllowDuplicate(false)
    } else {
      if (key === 'example_sentence') {
        latestExampleSentence.current = value
        resetExampleCheck()
      }
      setDraft((current) => ({ ...current, [key]: value }))
    }

    setNotice(null)
  }

  function applySenses(next: EntrySense[]) {
    setDraft((current) => withSenses(current, next))
    setNotice(null)
  }

  function updateSense(id: string, patchSense: Partial<EntrySense>) {
    applySenses(draft.senses.map((sense) => sense.id === id ? { ...sense, ...patchSense } : sense))
  }

  function setSensePos(id: string, pos: PartOfSpeech | null) {
    // Gender only means anything on a noun; drop it as soon as the sense stops being one.
    updateSense(id, { pos, gender: pos === 'noun' ? draft.senses.find((sense) => sense.id === id)?.gender ?? null : null })
  }

  function setSenseGender(id: string, gender: NounGender | null) {
    updateSense(id, { gender })
  }

  function addSense() {
    applySenses([...draft.senses, createSense('')])
  }

  /** The draft entry does not exist yet, so an unsaved sense is dropped outright. */
  function removeSense(id: string) {
    applySenses(draft.senses.filter((sense) => sense.id !== id))
  }

  function moveSense(id: string, delta: -1 | 1) {
    const index = draft.senses.findIndex((sense) => sense.id === id)
    const target = index + delta
    if (index < 0 || target < 0 || target >= draft.senses.length) return
    const next = [...draft.senses]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    applySenses(next)
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
    }
  }

  function clearDraft() {
    exampleSentenceDirty.current = false
    latestExampleSentence.current = ''
    resetExampleCheck()
    setDraft(blankDraft())
    setEntryKind('word')
    setIncludeExample(true)
    setExamplePreferenceTouched(false)
    setUndoSnapshot(null)
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
    setUsedAI(true)
  }

  function activeEnrichableFields(): EnrichableField[] {
    return enrichableFieldsFor(entryKind, entryKind !== 'sentence' && includeExample)
  }

  /** Per-field mini AI buttons. */
  async function enrich(fields: EnrichableField[]) {
    await runEnrich(fields, fields.join(','), false)
  }

  /** Only the fields that are still empty right now. */
  async function fillMissingWithAI() {
    const missing = activeEnrichableFields().filter((key) => key === 'translation'
      ? !translationFromSenses(draft.senses).trim()
      : !draft[key].trim())
    if (!missing.length) {
      setNotice('Nothing is empty. Use Regenerate all to replace what is there.')
      return
    }
    await runEnrich(missing, 'fill-missing', false)
  }

  /**
   * Every active field, unconditionally — including a hand-typed example sentence.
   * Origin is deliberately not consulted: a manually typed field has no AI origin,
   * so any origin check would silently skip exactly the field the user wants redone.
   */
  async function regenerateAll() {
    await runEnrich(activeEnrichableFields(), 'regenerate-all', true)
  }

  async function runEnrich(requestedFields: EnrichableField[], loadingKey: string, offerUndo: boolean) {
    const sourceDanish = draft.danish.trim()
    if (!sourceDanish) {
      setNotice('Type Danish text first.')
      return
    }
    if (!requestedFields.length) return

    const effectiveIncludeExample = entryKind !== 'sentence' && includeExample
    const snapshot: DraftSnapshot = { draft, exampleSuggestion, exampleCheckStatus, usedAI }

    setUndoSnapshot(null)
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
        let next = { ...current }
        for (const key of requestedFields) {
          if (typeof body[key] === 'string') next[key] = body[key]
        }
        if (requestedFields.includes('translation')) {
          // `senses` is the real payload (D16 puts pos and gender in this same response);
          // the flat `translation` string is the fallback for an older/partial response.
          const returned = parseSenses(body.senses)
          const senses = returned.length ? returned : splitTranslationIntoSenses(next.translation, entryKind)
          if (senses.length) next = withSenses(next, senses)
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

      if (requestedFields.includes('example_sentence') || requestedFields.includes('example_translation')) {
        exampleSentenceDirty.current = false
      }
      setUsedAI(true)
      setNotice(null)
      if (offerUndo) setUndoSnapshot(snapshot)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'AI enrichment failed')
    } finally {
      setAiLoading(null)
    }
  }

  function undoRegenerate() {
    if (!undoSnapshot) return

    exampleSentenceDirty.current = false
    latestExampleSentence.current = undoSnapshot.draft.example_sentence
    setDraft(undoSnapshot.draft)
    setExampleSuggestion(undoSnapshot.exampleSuggestion)
    setExampleCheckStatus(undoSnapshot.exampleCheckStatus)
    setUsedAI(undoSnapshot.usedAI)
    setUndoSnapshot(null)
    setNotice('Restored the text you had before regenerating.')
  }

  async function save() {
    if (aiLoading) return setNotice('Wait for the AI check to finish.')
    if (!draft.danish.trim()) return setNotice('Danish text is required.')
    const senses = activeSenses(draft.senses).map((sense) => ({ ...sense, text: sense.text.trim() }))
    if (!senses.length) return setNotice('Add a translation or use AI to fill it.')

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
      translation: translationFromSenses(senses),
      senses,
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
    setDraft(blankDraft())
    setEntryKind('word')
    setIncludeExample(true)
    setExamplePreferenceTouched(false)
    setUndoSnapshot(null)
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

  const duplicateMeanings = [...new Set(liveDuplicate.map((item) => item.translation?.trim() || 'No translation'))]
  // The primary sense is the first non-removed one: it owns the entry's example columns.
  const primaryId = activeSenses(draft.senses)[0]?.id ?? draft.senses[0]?.id ?? ''
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

        <div className="field field-wide sense-field">
          <span>
            <span>{translationLabel}</span>
            <AiMini loading={aiLoading === 'translation'} onClick={() => enrich(['translation'])} />
          </span>

          <div className="sense-list">
            {draft.senses.map((sense, index) => (
              <SenseRow
                key={sense.id}
                sense={sense}
                index={index}
                total={draft.senses.length}
                isPrimary={sense.id === primaryId}
                showGrammar={entryKind !== 'sentence'}
                allowRemove={draft.senses.length > 1}
                placeholder={index === 0 ? translationPlaceholder : 'another meaning'}
                onText={(value) => updateSense(sense.id, { text: value })}
                onPos={(value) => setSensePos(sense.id, value)}
                onGender={(value) => setSenseGender(sense.id, value)}
                onMove={(delta) => moveSense(sense.id, delta)}
                onRemove={() => removeSense(sense.id)}
              />
            ))}
          </div>

          {entryKind !== 'sentence' && (
            <button type="button" className="sense-add" onClick={addSense}>
              <Plus size={13} /> Add meaning
            </button>
          )}
        </div>

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

      {undoSnapshot && (
        <div className="notice composer-undo">
          <Bot size={16} />
          <span>Regenerated every field for this text.</span>
          <button type="button" className="soft-button composer-undo-action" disabled={!!aiLoading} onClick={undoRegenerate}>Undo</button>
        </div>
      )}

      <div className="composer-actions">
        <div className="composer-ai-actions">
          <button className="ai-fill-button" disabled={!!aiLoading} onClick={() => void fillMissingWithAI()}>
            {aiLoading === 'fill-missing' ? <Loader2 className="spin" size={17} /> : <WandSparkles size={17} />}
            Fill missing with AI
          </button>
          <button className="soft-button strong" disabled={!!aiLoading} onClick={() => void regenerateAll()}>
            {aiLoading === 'regenerate-all' ? <Loader2 className="spin" size={15} /> : <RotateCcw size={15} />}
            Regenerate all
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

function SenseRow({
  sense, index, total, isPrimary, showGrammar, allowRemove, placeholder,
  onText, onPos, onGender, onMove, onRemove,
}: {
  sense: EntrySense
  index: number
  total: number
  isPrimary: boolean
  showGrammar: boolean
  allowRemove: boolean
  placeholder: string
  onText: (value: string) => void
  onPos: (value: PartOfSpeech | null) => void
  onGender: (value: NounGender | null) => void
  onMove: (delta: -1 | 1) => void
  onRemove: () => void
}) {
  return (
    <div className={`sense-row${isPrimary ? ' primary' : ''}`}>
      <div className="sense-row-main">
        <input
          className="sense-text"
          value={sense.text}
          onChange={(e) => onText(e.target.value)}
          placeholder={placeholder}
          aria-label={`Meaning ${index + 1}`}
        />
        <div className="sense-row-tools">
          <button type="button" className="icon-button sense-move" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move meaning up"><ArrowUp size={13} /></button>
          <button type="button" className="icon-button sense-move" onClick={() => onMove(1)} disabled={index === total - 1} aria-label="Move meaning down"><ArrowDown size={13} /></button>
          <button type="button" className="icon-button danger sense-remove" onClick={onRemove} disabled={!allowRemove} aria-label="Remove meaning"><Trash2 size={13} /></button>
        </div>
      </div>

      {showGrammar && (
        <div className="sense-row-grammar">
          {isPrimary && <span className="sense-primary-chip">Primary</span>}
          <select
            className={`pos-chip pos-${sense.pos || 'none'}`}
            value={sense.pos || ''}
            onChange={(e) => onPos(e.target.value ? (e.target.value as PartOfSpeech) : null)}
            aria-label={`Part of speech for meaning ${index + 1}`}
          >
            <option value="">part of speech</option>
            {PARTS_OF_SPEECH.map((pos) => <option key={pos} value={pos}>{PART_OF_SPEECH_LABELS[pos]}</option>)}
          </select>

          {sense.pos === 'noun' && (
            <span className="gender-chip-group" role="group" aria-label={`Gender for meaning ${index + 1}`}>
              {(['en', 'et'] as const).map((gender) => (
                <button
                  key={gender}
                  type="button"
                  className={`gender-chip${sense.gender === gender ? ' active' : ''}`}
                  onClick={() => onGender(sense.gender === gender ? null : gender)}
                >
                  {gender}
                </button>
              ))}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function AiMini({ loading, onClick, label = 'AI' }: { loading: boolean; onClick: () => void; label?: string }) {
  return (
    <button type="button" className="ai-mini" onClick={(e) => { e.preventDefault(); onClick() }} aria-label={label === 'AI' ? 'Fill with AI' : label}>
      {loading ? <Loader2 className="spin" size={12} /> : <Sparkles size={12} />} {label}
    </button>
  )
}
