'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bot, Check, CircleAlert, Loader2, Plus, RotateCcw, Sparkles, WandSparkles, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { SenseRow } from '@/components/SenseRow'
import { errorMessage, readJsonRecord, requestEnrichment, stringField } from '@/lib/ai-responses'
import { discoverSynonyms } from '@/lib/entry-links'
import { inferDanishInputKind, inferEntryKind } from '@/lib/entry-kind'
import { mergeSenses } from '@/lib/sense-merge'
import { parseRefinedMeanings } from '@/lib/sense-refinement'
import {
  activeSenses,
  createSense,
  entrySenses,
  parseSenses,
  splitTranslationIntoSenses,
  translationFromSenses,
} from '@/lib/senses'
import type { EntryKind, EntrySense, NounGender, PartOfSpeech, TranslationLanguage, VocabularyEntry } from '@/lib/types'

/**
 * The one editor behind both `Add Danish` and `/words/[id]` (D7). Add-new and edit-existing are
 * the same component with the same AI actions; only the persistence ends differ, which is the
 * whole point — an action added here can never again exist on one surface and not the other.
 */
export type EntryEditorMode = 'create' | 'edit'

interface Draft {
  danish: string
  pronunciation: string
  /**
   * Derived from `senses` and never edited directly. It stays on the draft so the enrich field
   * plumbing (`EnrichableField`, per-field mini buttons, fill-missing) is unchanged, and so the
   * write keeps setting the denormalized column the DB expects.
   */
  translation: string
  /** Live senses only. Soft-deleted ones live in `archived` so their ids survive (D15). */
  senses: EntrySense[]
  /** The primary sense's example: it owns `example_sentence` / `example_translation` (D10). */
  example_sentence: string
  example_translation: string
}

type EnrichableField = Exclude<keyof Draft, 'danish' | 'senses'>
type DuplicateEntry = { id: string; danish: string; translation: string | null }
type ExampleCheckStatus = 'idle' | 'correct' | 'suggestion'

/** Everything a regenerate overwrites, kept so a single Undo can put it back. */
interface DraftSnapshot {
  draft: Draft
  archived: EntrySense[]
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

function draftFromEntry(entry: VocabularyEntry): Draft {
  // `entrySenses` also covers rows written before the senses migration by splitting `translation`.
  const senses = entrySenses(entry)
  return {
    danish: entry.danish,
    pronunciation: entry.pronunciation || '',
    translation: translationFromSenses(senses),
    senses: senses.length ? senses : [createSense('')],
    example_sentence: entry.example_sentence || '',
    example_translation: entry.example_translation || '',
  }
}

function archivedFromEntry(entry: VocabularyEntry | null | undefined): EntrySense[] {
  if (!entry) return []
  return parseSenses(entry.senses).filter((sense) => sense.removed_at)
}

/** senses are the source of truth; translation is recomputed from them on every change. */
function withSenses(draft: Draft, senses: EntrySense[]): Draft {
  const next = senses.length ? senses : [createSense('')]
  return { ...draft, senses: next, translation: translationFromSenses(next) }
}

export function EntryEditor({
  mode,
  entry = null,
  compact = false,
  translationLanguage = 'ru',
}: {
  mode: EntryEditorMode
  entry?: VocabularyEntry | null
  compact?: boolean
  translationLanguage?: TranslationLanguage
}): React.JSX.Element {
  const editing = mode === 'edit' && Boolean(entry)
  const router = useRouter()

  const [draft, setDraft] = useState<Draft>(() => entry ? draftFromEntry(entry) : blankDraft())
  const [archived, setArchived] = useState<EntrySense[]>(() => archivedFromEntry(entry))
  const [entryKind, setEntryKind] = useState<EntryKind>(() => entry?.entry_kind || 'word')
  const [includeExample, setIncludeExample] = useState(() => entry
    ? entry.entry_kind !== 'sentence' && Boolean(entry.example_sentence || entry.example_translation)
    : true)
  const [examplePreferenceTouched, setExamplePreferenceTouched] = useState(editing)
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
  const latestExampleSentence = useRef(entry?.example_sentence || '')

  /**
   * Every draft write goes through `commitDraft`, so the async AI flows can read the current
   * draft synchronously. Per-sense example generation runs after a regenerate has already
   * rewritten `senses`, and a stale closure there would write examples onto senses that no
   * longer exist.
   */
  const draftRef = useRef(draft)
  const archivedRef = useRef(archived)
  /**
   * Sense ids that exist in the database. Only these need soft-deleting: an id that was never
   * written cannot have an FSRS objective pointing at it, and leaving its tombstone behind
   * would just be noise. Refreshed on every successful save.
   */
  const savedSenseIds = useRef<Set<string>>(new Set(parseSenses(entry?.senses).map((sense) => sense.id)))

  function commitDraft(updater: (current: Draft) => Draft): Draft {
    const next = updater(draftRef.current)
    draftRef.current = next
    setDraft(next)
    return next
  }

  function resetDraft(next: Draft, nextArchived: EntrySense[]): void {
    draftRef.current = next
    archivedRef.current = nextArchived
    setDraft(next)
    setArchived(nextArchived)
  }

  function commitArchived(next: EntrySense[]): void {
    archivedRef.current = next
    setArchived(next)
  }

  const entryId = entry?.id || null

  // Only re-seed when a different entry is shown. A refresh while the user is mid-edit must
  // not silently replace what they typed.
  useEffect(() => {
    if (!entry || mode !== 'edit') return
    savedSenseIds.current = new Set(parseSenses(entry.senses).map((sense) => sense.id))
    resetDraft(draftFromEntry(entry), archivedFromEntry(entry))
    setEntryKind(entry.entry_kind || 'word')
    setIncludeExample(entry.entry_kind !== 'sentence' && Boolean(entry.example_sentence || entry.example_translation))
    latestExampleSentence.current = entry.example_sentence || ''
    setUndoSnapshot(null)
    setNotice(null)
    setUsedAI(false)
    resetExampleCheck()
  }, [entryId, mode])

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
      let query = createClient()
        .from('vocabulary_entries')
        .select('id, danish, translation')
        .ilike('danish', danish)
        .limit(5)
      // The entry being edited is not a duplicate of itself.
      if (entryId) query = query.neq('id', entryId)

      const { data } = await query
      if (!cancelled) setLiveDuplicate(data || [])
    }, 320)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [draft.danish, entryId])

  function resetExampleCheck() {
    setExampleSuggestion(null)
    setExampleCheckStatus('idle')
  }

  /**
   * A sentence has exactly one meaning. Fold the extra rows into the primary sense rather than
   * leaving a comma-split sentence translation behind — and keep the primary sense's id, so the
   * meaning that survives keeps its scheduling state.
   */
  function collapseForSentence(current: Draft): Draft {
    const active = activeSenses(current.senses)
    if (active.length <= 1) return current
    const [first, ...rest] = active
    if (editing) {
      const removedAt = new Date().toISOString()
      commitArchived([...archivedRef.current, ...rest.map((sense) => ({ ...sense, removed_at: removedAt }))])
    }
    return withSenses(current, [{ ...first, text: translationFromSenses(active) }])
  }

  function patch(key: 'danish' | EnrichableField, value: string) {
    if (key === 'danish') {
      const nextKind = inferEntryKind(value)
      const becameSentence = nextKind === 'sentence' && entryKind !== 'sentence'

      commitDraft((current) => {
        if (nextKind !== 'sentence') return { ...current, danish: value }
        const collapsed = collapseForSentence({ ...current, danish: value })
        // Only the transition clears the example fields. Typing inside an entry that was
        // already a sentence must not keep wiping something the learner can still see.
        return becameSentence ? { ...collapsed, example_sentence: '', example_translation: '' } : collapsed
      })
      setEntryKind(nextKind)

      if (nextKind === 'sentence') {
        if (becameSentence) {
          exampleSentenceDirty.current = false
          latestExampleSentence.current = ''
          resetExampleCheck()
        }
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
      commitDraft((current) => ({ ...current, [key]: value }))
    }

    setNotice(null)
  }

  function applySenses(next: EntrySense[]) {
    commitDraft((current) => withSenses(current, next))
    setNotice(null)
  }

  function updateSense(id: string, patchSense: Partial<EntrySense>) {
    applySenses(draftRef.current.senses.map((sense) => sense.id === id ? { ...sense, ...patchSense } : sense))
  }

  function setSensePos(id: string, pos: PartOfSpeech | null) {
    // Gender only means anything on a noun; drop it as soon as the sense stops being one.
    updateSense(id, { pos, gender: pos === 'noun' ? draftRef.current.senses.find((sense) => sense.id === id)?.gender ?? null : null })
  }

  function setSenseGender(id: string, gender: NounGender | null) {
    updateSense(id, { gender })
  }

  function addSense() {
    applySenses([...draftRef.current.senses, createSense('')])
  }

  /**
   * A draft entry does not exist yet, so an unsaved sense is dropped outright. A saved sense is
   * soft-deleted instead: its id may already key an FSRS objective (D15).
   */
  function removeSense(id: string) {
    const removed = draftRef.current.senses.find((sense) => sense.id === id)
    if (editing && removed && savedSenseIds.current.has(id)) {
      commitArchived([...archivedRef.current, { ...removed, removed_at: new Date().toISOString() }])
    }
    applySenses(draftRef.current.senses.filter((sense) => sense.id !== id))
  }

  function moveSense(id: string, delta: -1 | 1) {
    const senses = draftRef.current.senses
    const index = senses.findIndex((sense) => sense.id === id)
    const target = index + delta
    if (index < 0 || target < 0 || target >= senses.length) return
    const next = [...senses]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    // The example columns belong to whichever sense is primary, so they move with the rows.
    commitDraft((current) => rebalanceExamples(withSenses(current, next), senses[0]?.id))
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
      commitDraft((current) => ({ ...current, example_sentence: '', example_translation: '' }))
    }
  }

  function clearDraft() {
    exampleSentenceDirty.current = false
    resetExampleCheck()
    setUndoSnapshot(null)
    setDuplicate(null)
    setLiveDuplicate([])
    setAllowDuplicate(false)
    setNotice(null)

    if (editing && entry) {
      // Editing an entry has no blank state to return to: revert to what is stored.
      resetDraft(draftFromEntry(entry), archivedFromEntry(entry))
      setEntryKind(entry.entry_kind || 'word')
      setIncludeExample(entry.entry_kind !== 'sentence' && Boolean(entry.example_sentence || entry.example_translation))
      latestExampleSentence.current = entry.example_sentence || ''
      setUsedAI(false)
      setNotice('Reverted to the saved version.')
      return
    }

    latestExampleSentence.current = ''
    resetDraft(blankDraft(), [])
    setEntryKind('word')
    setIncludeExample(true)
    setExamplePreferenceTouched(false)
    setUsedAI(false)
    window.setTimeout(() => firstInput.current?.focus(), 0)
  }

  async function checkDanishForm() {
    const original = draftRef.current.danish.trim()
    if (!original) {
      setNotice('Type Danish text first.')
      return
    }

    const kind = inferDanishInputKind(original)
    setAiLoading('danish-check')
    try {
      const res = await fetch('/api/ai/base-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ danish: original, mode: kind }),
      })
      const body = await readJsonRecord(res)
      if (!res.ok) throw new Error(errorMessage(body, 'Could not check this Danish text'))

      const result = (stringField(body, 'result') || '').trim()
      if (!result) throw new Error('AI returned empty Danish text')

      if (body.is_correct === true || result === original) {
        setNotice(kind === 'word' ? 'Already in base form.' : kind === 'phrase' ? 'Phrase looks good.' : 'Sentence looks correct.')
      } else {
        patch('danish', result)
        setUsedAI(true)
        setNotice(kind === 'word' ? `Base form: ${result}` : kind === 'phrase' ? `Normalized phrase: ${result}` : `Corrected sentence: ${result}`)
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not check this Danish text')
    } finally {
      setAiLoading(null)
    }
  }

  async function checkExampleSentence() {
    const sourceSentence = draftRef.current.example_sentence.trim()
    if (!sourceSentence) return

    setAiLoading('example-check')
    try {
      const res = await fetch('/api/ai/check-example', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sentence: sourceSentence }),
      })
      const body = await readJsonRecord(res)
      if (!res.ok) throw new Error(errorMessage(body, 'Could not check this example sentence'))

      if (latestExampleSentence.current.trim() !== sourceSentence) return

      const corrected = (stringField(body, 'corrected_sentence') || '').trim()
      const translation = (stringField(body, 'translation') || '').trim()

      if (translation) {
        commitDraft((current) => current.example_sentence.trim() === sourceSentence
          ? { ...current, example_translation: translation }
          : current)
      }

      if (body.is_correct !== true && corrected && corrected !== sourceSentence) {
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
    commitDraft((current) => ({ ...current, example_sentence: corrected }))
    setExampleSuggestion(null)
    setExampleCheckStatus('correct')
    setUsedAI(true)
  }

  function activeEnrichableFields(): EnrichableField[] {
    return enrichableFieldsFor(entryKind, entryKind !== 'sentence' && includeExample)
  }

  /** Per-field mini AI buttons. */
  async function enrich(fields: EnrichableField[]) {
    await runEnrich(fields, fields.join(','), false, false)
  }

  /** Only the fields that are still empty right now. */
  async function fillMissingWithAI() {
    const current = draftRef.current
    const missing = activeEnrichableFields().filter((key) => key === 'translation'
      ? !translationFromSenses(current.senses).trim()
      : !current[key].trim())
    if (!missing.length) {
      setNotice('Nothing is empty. Use Regenerate all to replace what is there.')
      return
    }
    await runEnrich(missing, 'fill-missing', false, false)
  }

  /**
   * Every active field, unconditionally — including a hand-typed example sentence.
   * Origin is deliberately not consulted: a manually typed field has no AI origin,
   * so any origin check would silently skip exactly the field the user wants redone.
   *
   * Sense examples follow the same rule with one limit from D10: an example that already
   * exists is regenerated, an absent one is never eagerly created. Generating an example for
   * every meaning of every word is exactly the cost the lazy model exists to avoid.
   */
  async function regenerateAll() {
    const succeeded = await runEnrich(activeEnrichableFields(), 'regenerate-all', true, true)
    if (!succeeded || !editing) return

    const targets = activeSenses(draftRef.current.senses)
      .slice(1)
      .filter((sense) => sense.example?.trim())
      .map((sense) => sense.id)

    for (const senseId of targets) {
      await generateSenseExample(senseId, true, false)
    }
  }

  async function runEnrich(
    requestedFields: EnrichableField[],
    loadingKey: string,
    offerUndo: boolean,
    regenerate: boolean,
  ): Promise<boolean> {
    const current = draftRef.current
    const sourceDanish = current.danish.trim()
    if (!sourceDanish) {
      setNotice('Type Danish text first.')
      return false
    }
    if (!requestedFields.length) return false

    const effectiveIncludeExample = entryKind !== 'sentence' && includeExample
    const snapshot: DraftSnapshot = {
      draft: current,
      archived: archivedRef.current,
      exampleSuggestion,
      exampleCheckStatus,
      usedAI,
    }

    setUndoSnapshot(null)
    setAiLoading(loadingKey)

    try {
      const body = await requestEnrichment({
        draft: {
          danish: sourceDanish,
          pronunciation: current.pronunciation,
          translation: current.translation,
          example_sentence: current.example_sentence,
          example_translation: current.example_translation,
        },
        fields: requestedFields,
        entryKind,
        includeExample: effectiveIncludeExample,
        regenerate,
      })

      commitDraft((latest) => {
        let next = { ...latest }
        for (const key of requestedFields) {
          const value = body[key]
          if (typeof value === 'string') next[key] = value
        }
        if (requestedFields.includes('translation')) {
          // `senses` is the real payload (D16 puts pos and gender in this same response);
          // the flat `translation` string is the fallback for an older/partial response.
          const returned = body.senses || []
          const generated = returned.length ? returned : splitTranslationIntoSenses(next.translation, entryKind)
          if (generated.length) next = applyGeneratedSenses(next, generated)
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
      return true
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'AI enrichment failed')
      return false
    } finally {
      setAiLoading(null)
    }
  }

  /**
   * Fold regenerated senses into the ones already on the draft (D15). Matching is by normalized
   * text; a match keeps its id, coverage and created_at, and a meaning that vanished is
   * soft-deleted rather than dropped, because an id that disappears strands the FSRS objective
   * keyed to it. A draft that was never saved has no such state, so its tombstones are dropped.
   */
  function applyGeneratedSenses(current: Draft, generated: EntrySense[]): Draft {
    const previousPrimaryId = activeSenses(current.senses)[0]?.id
    const merged = mergeSenses([...current.senses, ...archivedRef.current], generated)
    const live = merged.filter((sense) => !sense.removed_at)
    const removed = merged.filter((sense) => sense.removed_at)
    commitArchived(editing ? removed : [])
    return rebalanceExamples(withSenses(current, live), previousPrimaryId)
  }

  /**
   * The primary sense reads the entry's example columns; every other sense carries its own
   * example (D10). When the primary sense changes, the two swap, or a regenerate would leave the
   * old primary's example attached to a meaning that no longer owns those columns.
   */
  function rebalanceExamples(next: Draft, previousPrimaryId: string | undefined): Draft {
    const live = activeSenses(next.senses)
    const primary = live[0]
    if (!primary || !previousPrimaryId || primary.id === previousPrimaryId) return next

    const senses = next.senses.map((sense) => {
      if (sense.id === primary.id) return { ...sense, example: null, example_translation: null }
      if (sense.id === previousPrimaryId) {
        return {
          ...sense,
          example: next.example_sentence.trim() || null,
          example_translation: next.example_translation.trim() || null,
        }
      }
      return sense
    })

    return {
      ...withSenses(next, senses),
      example_sentence: primary.example || '',
      example_translation: primary.example_translation || '',
    }
  }

  /**
   * Per-sense AI action (D10). The request carries the meaning so the sentence demonstrates
   * that sense and not another meaning of the same Danish word.
   */
  async function generateSenseExample(senseId: string, regenerate: boolean, clearUndo = true) {
    const current = draftRef.current
    const sense = current.senses.find((item) => item.id === senseId)
    const sourceDanish = current.danish.trim()
    if (!sense || !sense.text.trim()) {
      setNotice('Write this meaning first.')
      return
    }
    if (!sourceDanish) {
      setNotice('Type Danish text first.')
      return
    }

    if (clearUndo) setUndoSnapshot(null)
    setAiLoading(`sense-example:${senseId}`)
    try {
      const body = await requestEnrichment({
        draft: {
          danish: sourceDanish,
          example_sentence: regenerate ? '' : sense.example || '',
          example_translation: '',
        },
        fields: ['example_sentence', 'example_translation'],
        entryKind: 'word',
        includeExample: true,
        regenerate,
        sense: { text: sense.text.trim(), pos: sense.pos },
      })

      const example = (body.example_sentence || '').trim()
      const exampleTranslation = (body.example_translation || '').trim()
      if (!example) throw new Error('AI returned no example sentence')

      commitDraft((latest) => withSenses(latest, latest.senses.map((item) => item.id === senseId
        ? { ...item, example, example_translation: exampleTranslation || null }
        : item)))
      setUsedAI(true)
      setNotice(null)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'AI enrichment failed')
    } finally {
      setAiLoading(null)
    }
  }

  /**
   * Per-sense AI action: part of speech and gender for one meaning (D11's refinement, on demand).
   * The other meanings ride along as context so the model can tell which sense this one is, but
   * only this row is changed, and its text never is.
   */
  async function classifySenseGrammar(senseId: string) {
    const current = draftRef.current
    const live = activeSenses(current.senses)
    const index = live.findIndex((sense) => sense.id === senseId)
    const sourceDanish = current.danish.trim()
    if (index < 0 || !live[index].text.trim()) return setNotice('Write this meaning first.')
    if (!sourceDanish) return setNotice('Type Danish text first.')

    setUndoSnapshot(null)
    setAiLoading(`sense-grammar:${senseId}`)
    try {
      const res = await fetch('/api/ai/refine-senses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft: { danish: sourceDanish, senses: live.map((sense) => sense.text.trim()) } }),
      })
      const body = await readJsonRecord(res)
      if (!res.ok) throw new Error(errorMessage(body, 'Could not classify this meaning'))
      const meaning = parseRefinedMeanings(body, live.length).find((item) => item.indices.includes(index + 1))
      if (!meaning?.pos) throw new Error('AI could not tell the part of speech for this meaning.')
      updateSense(senseId, { pos: meaning.pos, gender: meaning.pos === 'noun' ? meaning.gender : null })
      setUsedAI(true)
      setNotice(null)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not classify this meaning')
    } finally {
      setAiLoading(null)
    }
  }

  function setSenseExample(senseId: string, patchSense: Pick<Partial<EntrySense>, 'example' | 'example_translation'>) {
    updateSense(senseId, patchSense)
  }

  function undoRegenerate() {
    if (!undoSnapshot) return

    exampleSentenceDirty.current = false
    latestExampleSentence.current = undoSnapshot.draft.example_sentence
    resetDraft(undoSnapshot.draft, undoSnapshot.archived)
    setExampleSuggestion(undoSnapshot.exampleSuggestion)
    setExampleCheckStatus(undoSnapshot.exampleCheckStatus)
    setUsedAI(undoSnapshot.usedAI)
    setUndoSnapshot(null)
    setNotice('Restored the text you had before regenerating.')
  }

  /**
   * Look for synonyms of the entry that was just written (D16, step 4).
   *
   * Deliberately not awaited, and deliberately after the write: the row is already committed
   * and the composer is already reset by the time this runs, so a slow, rate-limited or absent
   * model costs the learner nothing. `discoverSynonyms` swallows every failure, and the only
   * visible effect of success is that the chips and the ego-graph appear on the next render.
   */
  function runSynonymDiscovery(entryId: string, kind: EntryKind | null | undefined): void {
    // Synonymy between whole sentences is not a claim worth an AI call. The route refuses it
    // anyway; this only saves the round-trip.
    if (!entryId || kind === 'sentence') return
    void discoverSynonyms(entryId).then((found) => {
      // Only a run that actually stored an edge is worth re-rendering the route for.
      if (found > 0) router.refresh()
    })
  }

  async function save() {
    if (aiLoading) return setNotice('Wait for the AI check to finish.')
    const current = draftRef.current
    if (!current.danish.trim()) return setNotice('Danish text is required.')
    const senses = activeSenses(current.senses).map((sense) => ({ ...sense, text: sense.text.trim() }))
    if (!senses.length) return setNotice('Add a translation or use AI to fill it.')

    setSaving(true)
    const supabase = createClient()

    if (!allowDuplicate && !editing) {
      const { data } = await supabase
        .from('vocabulary_entries')
        .select('id, danish, translation')
        .ilike('danish', current.danish.trim())
        .limit(5)

      if (data?.length) {
        setDuplicate(data)
        setSaving(false)
        return
      }
    }

    const storeExample = entryKind !== 'sentence' && includeExample
    const primaryId = senses[0]?.id
    const payload = {
      danish: current.danish.trim(),
      pronunciation: current.pronunciation.trim() || null,
      translation: translationFromSenses(senses),
      // Soft-deleted senses ride along so their ids stay resolvable (D15).
      senses: [
        ...senses.map((sense) => sense.id === primaryId
          // The primary sense reads the columns; storing a copy on the object too would let the
          // two drift apart (D10).
          ? { ...sense, example: null, example_translation: null }
          : sense),
        ...archivedRef.current,
      ],
      example_sentence: storeExample ? current.example_sentence.trim() || null : null,
      example_translation: storeExample ? current.example_translation.trim() || null : null,
      entry_kind: entryKind,
      ai_enriched: (entry?.ai_enriched ?? false) || usedAI,
    }

    if (editing && entry) {
      const { data: updated, error } = await supabase
        .from('vocabulary_entries')
        .update(payload)
        .eq('id', entry.id)
        .select('*')
        .single()

      if (error || !updated) {
        setNotice('Could not save this entry. Please try again.')
        setSaving(false)
        return
      }

      const saved = updated as VocabularyEntry
      exampleSentenceDirty.current = false
      latestExampleSentence.current = saved.example_sentence || ''
      resetExampleCheck()
      savedSenseIds.current = new Set(parseSenses(saved.senses).map((sense) => sense.id))
      resetDraft(draftFromEntry(saved), archivedFromEntry(saved))
      setUndoSnapshot(null)
      setUsedAI(false)
      setNotice('Saved. Your changes are live.')
      setSaving(false)
      router.refresh()
      runSynonymDiscovery(saved.id, saved.entry_kind)
      return
    }

    const { data: savedEntry, error } = await supabase
      .from('vocabulary_entries')
      .insert({ ...payload, familiarity: 0 })
      .select('id, entry_kind')
      .single()

    if (error) {
      setNotice('Could not save this entry. Please try again.')
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

    if (savedEntry?.id) runSynonymDiscovery(savedEntry.id, savedEntry.entry_kind)

    exampleSentenceDirty.current = false
    latestExampleSentence.current = ''
    resetExampleCheck()
    resetDraft(blankDraft(), [])
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
  const liveSenses = activeSenses(draft.senses)
  const exampleFieldLabel = editing && liveSenses.length > 1 ? 'Example sentence · primary meaning' : 'Example sentence'
  const saveLabel = editing
    ? 'Save changes'
    : entryKind === 'sentence' ? 'Save sentence' : inputKind === 'phrase' ? 'Save phrase' : 'Save word'

  return (
    <section className={`composer-card${editing ? ' entry-editor-card' : ''}`} onKeyDown={keyDown}>
      <div className="composer-heading">
        <div>
          <span className="eyebrow"><Sparkles size={14} /> {editing ? 'EDIT ENTRY' : 'QUICK CAPTURE'}</span>
          <h2>{editing ? 'Edit this entry' : 'Add Danish'}</h2>
          <p>{editing
            ? 'Every meaning, its grammar, and its own example. The same AI actions as capture.'
            : 'Word, phrase, or whole sentence. AI only when you want it.'}</p>
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
                translationLanguage={translationLanguage}
                // Own examples only exist once the entry does, and never on the primary sense,
                // which reads the entry's example columns instead (D10).
                exampleState={editing && entryKind !== 'sentence' && sense.id !== primaryId ? {
                  loading: aiLoading === `sense-example:${sense.id}`,
                  disabled: !!aiLoading,
                  onGenerate: () => void generateSenseExample(sense.id, false),
                  onRegenerate: () => void generateSenseExample(sense.id, true),
                  onChange: (patchSense) => setSenseExample(sense.id, patchSense),
                  onClear: () => setSenseExample(sense.id, { example: null, example_translation: null }),
                } : null}
                grammarState={entryKind !== 'sentence' ? {
                  loading: aiLoading === `sense-grammar:${sense.id}`,
                  disabled: !!aiLoading || !sense.text.trim() || !draft.danish.trim(),
                  onClassify: () => void classifySenseGrammar(sense.id),
                } : null}
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
                    <span>{exampleFieldLabel}</span>
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
            {/* Straight to the entry, which is a real route now (D7) — a search for a sentence
                on the Words page used to find nothing. */}
            <button className="soft-button" onClick={() => router.push(`/words/${duplicate[0].id}`)}>Open existing</button>
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
          <button className="soft-button" disabled={saving || !!aiLoading} onClick={clearDraft}>{editing ? 'Revert' : 'Clear'}</button>
        </div>
        <div className="save-wrap">
          <span className="keyboard-hint">⌘ Enter</span>
          <button className="primary-button" disabled={saving || !!aiLoading} onClick={save}>
            {saving ? <Loader2 className="spin" size={17} /> : <Plus size={17} />}
            {saveLabel}
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
