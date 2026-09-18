'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, CircleAlert, Loader2, Plus, RotateCcw, Sparkles, Undo2, WandSparkles, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { AutoGrowTextarea } from '@/components/AutoGrowTextarea'
import { SenseRow } from '@/components/SenseRow'
import { Toast, type ToastTone } from '@/components/Toast'
import { errorMessage, readJsonRecord, readMisspellings, requestEnrichment, stringField, UnknownDanishError } from '@/lib/ai-responses'
import { diffAnswer } from '@/lib/answer-diff'
import { corBaseForm, corLookupForm, fetchCorForms, fillCorGender, isKnownDanishForm, type CorForm } from '@/lib/cor'
import { replaceWordInText, type Misspelling } from '@/lib/danish-text'
import { discoverSynonyms } from '@/lib/entry-links'
import { inferDanishInputKind, inferEntryKind, type DanishInputKind } from '@/lib/entry-kind'
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
  // A new entry starts without an example: it is one tap away, and an empty form should show
  // only what the learner has to fill in. An existing entry keeps whatever it was saved with.
  const [includeExample, setIncludeExample] = useState(() => entry
    ? entry.entry_kind !== 'sentence' && Boolean(entry.example_sentence || entry.example_translation)
    : false)
  const [examplePreferenceTouched, setExamplePreferenceTouched] = useState(editing)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [aiLoading, setAiLoading] = useState<string | null>(null)
  const [undoSnapshot, setUndoSnapshot] = useState<DraftSnapshot | null>(null)
  const [duplicate, setDuplicate] = useState<DuplicateEntry[] | null>(null)
  const [liveDuplicate, setLiveDuplicate] = useState<DuplicateEntry[]>([])
  const [allowDuplicate, setAllowDuplicate] = useState(false)
  const [notice, setNotice] = useState<{ text: string; tone: ToastTone } | null>(null)
  /** The undo toast is transient; `undoSnapshot` outlives it and keeps Undo in the AI sheet. */
  const [undoToastOpen, setUndoToastOpen] = useState(false)
  const [usedAI, setUsedAI] = useState(false)
  const [exampleSuggestion, setExampleSuggestion] = useState<string | null>(null)
  /** Words the Danish dictionary does not know, shown while the learner is still typing (§3). */
  const [exampleSpelling, setExampleSpelling] = useState<Misspelling[]>([])
  /**
   * The last AI verdict on the Danish text itself. It only applies while the text is unchanged,
   * which is also what stops Fill missing / Regenerate all from checking the same text twice.
   */
  const [danishCheck, setDanishCheck] = useState<DanishCheck | null>(null)
  const [aiMenuOpen, setAiMenuOpen] = useState(false)
  const danishCheckRef = useRef<DanishCheck | null>(null)
  const [exampleCheckStatus, setExampleCheckStatus] = useState<ExampleCheckStatus>('idle')
  const firstInput = useRef<HTMLTextAreaElement>(null)
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
  /**
   * The Danish text the word register refused to enrich (issue #5 §2). Holding it here is what
   * turns the refusal into a warning: the second press on the same text enriches anyway, and
   * typing something else arms the check again.
   */
  const enrichAnyway = useRef('')
  /**
   * The Danish text the register refused, held so the learner's second press saves it anyway.
   * Every word is checked against COR before it can be saved, but the register is missing a few
   * real forms and knows no proper nouns, so the check warns and proposes — it never traps.
   */
  const saveAnyway = useRef('')

  function notify(text: string, tone: ToastTone = 'info'): void {
    setNotice({ text, tone })
  }

  function notifyError(error: unknown, fallback: string): void {
    setNotice({ text: error instanceof Error ? error.message : fallback, tone: 'error' })
  }

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

  // Every path that offers an undo goes through `undoSnapshot`, so opening the toast here covers
  // all of them, and re-opens it when a second regenerate replaces the first snapshot.
  useEffect(() => {
    if (undoSnapshot) setUndoToastOpen(true)
  }, [undoSnapshot])

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

  /**
   * Instant typo feedback on the example sentence (issue #5 §3).
   *
   * A local dictionary lookup, so it answers while the learner is still typing — no model, no key,
   * no cost. It is never a verdict: `Checking…` on blur is what judges whether the sentence is
   * natural Danish, and a word the dictionary does not know may still be right.
   */
  useEffect(() => {
    const sentence = draft.example_sentence.trim()
    setExampleSpelling([])
    if (entryKind === 'sentence' || !includeExample || !sentence) return

    let cancelled = false
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch('/api/danish/spell', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: sentence }),
        })
        const body = await readJsonRecord(response)
        if (!cancelled && response.ok) setExampleSpelling(readMisspellings(body))
      } catch {
        // A hint that never arrives is not worth telling the learner about.
      }
    }, 600)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [draft.example_sentence, entryKind, includeExample])

  function resetExampleCheck() {
    setExampleSuggestion(null)
    setExampleCheckStatus('idle')
  }

  /** Apply one dictionary suggestion to the example sentence, and drop it from the hint. */
  function applySpellingFix(word: string, replacement: string): void {
    commitDraft((current) => ({ ...current, example_sentence: replaceWordInText(current.example_sentence, word, replacement) }))
    exampleSentenceDirty.current = true
    setExampleSpelling((current) => current.filter((item) => item.word !== word))
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
        setIncludeExample(false)
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
      notify('Reverted to the saved version.', 'success')
      return
    }

    latestExampleSentence.current = ''
    resetDraft(blankDraft(), [])
    setEntryKind('word')
    setIncludeExample(false)
    setExamplePreferenceTouched(false)
    setUsedAI(false)
    window.setTimeout(() => firstInput.current?.focus(), 0)
  }

  function recordDanishCheck(next: DanishCheck | null): void {
    danishCheckRef.current = next
    setDanishCheck(next)
  }

  /**
   * Check the Danish text by what it is. A word is brought to its base form in place: the base
   * form is what gets saved, translated and reviewed. A phrase or sentence is verified: a needed
   * correction is proposed for the learner to accept, never applied silently, and a correct one is
   * confirmed. Returns the text the rest of an AI action should work from.
   */
  async function checkDanishForm(options: { quiet?: boolean } = {}): Promise<string | null> {
    const original = draftRef.current.danish.trim()
    if (!original) {
      if (!options.quiet) notify('Type Danish text first.')
      return null
    }
    const previous = danishCheckRef.current
    // An automatic check never repeats itself for the same text; an explicit tap always runs.
    if (options.quiet && previous && (previous.text === original || previous.checked === original)) return original

    const kind = inferDanishInputKind(original)
    if (!options.quiet) setAiLoading('danish-check')
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
      // The learner kept typing while the check ran; its verdict is about text that is gone.
      if (draftRef.current.danish.trim() !== original) return draftRef.current.danish.trim()

      const correct = body.is_correct === true || result === original
      if (kind === 'word') {
        if (!correct) {
          patch('danish', result)
          setUsedAI(true)
        }
        recordDanishCheck({ text: result, checked: original, kind, status: correct ? 'correct' : 'changed', suggestion: correct ? null : original })
        return result
      }
      recordDanishCheck({ text: original, checked: original, kind, status: correct ? 'correct' : 'suggestion', suggestion: correct ? null : result })
      setUsedAI(true)
      return original
    } catch (error) {
      if (!options.quiet) notifyError(error, 'Could not check this Danish text')
      return original
    } finally {
      if (!options.quiet) setAiLoading((current) => current === 'danish-check' ? null : current)
    }
  }

  function applyDanishSuggestion() {
    const check = danishCheckRef.current
    if (!check?.suggestion || check.status !== 'suggestion') return
    patch('danish', check.suggestion)
    recordDanishCheck({ ...check, text: check.suggestion, status: 'applied' })
    setUsedAI(true)
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
        notifyError(error, 'Could not check this example sentence')
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
    const snapshot = await verifyBeforeEnrich('fill-missing')
    if (!snapshot) return
    const current = draftRef.current
    const missing = activeEnrichableFields().filter((key) => key === 'translation'
      ? !translationFromSenses(current.senses).trim()
      : !current[key].trim())
    if (!missing.length) {
      await snapshot.pending
      setAiLoading(null)
      notify('Nothing is empty. Use Regenerate all to replace what is there.')
      return
    }
    await Promise.all([runEnrich(missing, 'fill-missing', false, false), snapshot.pending])
  }

  /**
   * Both whole-entry AI actions check the Danish first (item: base form / verify). A word's base
   * form has to be settled before translating, so that check is awaited; a phrase or sentence
   * check only proposes a correction, so it runs alongside enrichment instead of delaying it.
   */
  async function verifyBeforeEnrich(loadingKey: string): Promise<{ pending: Promise<unknown>; snapshot: DraftSnapshot } | null> {
    const current = draftRef.current
    if (!current.danish.trim()) {
      notify('Type Danish text first.')
      return null
    }
    const snapshot: DraftSnapshot = { draft: current, archived: archivedRef.current, exampleSuggestion, exampleCheckStatus, usedAI }
    if (inferDanishInputKind(current.danish) === 'word') {
      setAiLoading(loadingKey)
      await checkDanishForm({ quiet: true })
      return { pending: Promise.resolve(), snapshot }
    }
    return { pending: checkDanishForm({ quiet: true }), snapshot }
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
    const verified = await verifyBeforeEnrich('regenerate-all')
    if (!verified) return
    const [succeeded] = await Promise.all([runEnrich(activeEnrichableFields(), 'regenerate-all', true, true, verified.snapshot), verified.pending])
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
    /** What Undo restores, when an earlier step of the same action already changed the draft. */
    undoTo?: DraftSnapshot,
  ): Promise<boolean> {
    const current = draftRef.current
    const sourceDanish = current.danish.trim()
    if (!sourceDanish) {
      notify('Type Danish text first.')
      return false
    }
    if (!requestedFields.length) return false

    const effectiveIncludeExample = entryKind !== 'sentence' && includeExample
    const snapshot: DraftSnapshot = undoTo || {
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
        allowUnknownDanish: enrichAnyway.current === sourceDanish,
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
      if (error instanceof UnknownDanishError) enrichAnyway.current = sourceDanish
      notifyError(error, 'AI enrichment failed')
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
      notify('Write this meaning first.')
      return
    }
    if (!sourceDanish) {
      notify('Type Danish text first.')
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
        allowUnknownDanish: enrichAnyway.current === sourceDanish,
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
      notifyError(error, 'AI enrichment failed')
    } finally {
      setAiLoading(null)
    }
  }

  /**
   * Per-sense grammar action: part of speech and gender for one meaning (D11's refinement, on
   * demand). The other meanings ride along as context so a model can tell which sense this one
   * is, but only this row is changed, and its text never is.
   *
   * The route answers from the word register whenever COR's candidates agree, in which case no
   * model was called and the entry is not marked AI-enriched (issue #5 §1).
   */
  async function classifySenseGrammar(senseId: string) {
    const current = draftRef.current
    const live = activeSenses(current.senses)
    const index = live.findIndex((sense) => sense.id === senseId)
    const sourceDanish = current.danish.trim()
    if (index < 0 || !live[index].text.trim()) return notify('Write this meaning first.')
    if (!sourceDanish) return notify('Type Danish text first.')

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
      if (!meaning?.pos) throw new Error('Could not tell the part of speech for this meaning.')
      updateSense(senseId, { pos: meaning.pos, gender: meaning.pos === 'noun' ? meaning.gender : null })
      if (stringField(body, 'source') !== 'cor') setUsedAI(true)
      setNotice(null)
    } catch (error) {
      notifyError(error, 'Could not classify this meaning')
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
    notify('Restored the text you had before regenerating.', 'success')
  }

  /**
   * Check a single word against the word register before it is allowed to be saved.
   *
   * Two things are refused, both with a proposal the learner can take or leave: a word COR does
   * not know at all (the local dictionary suggests the nearest real words), and a word that is
   * not its dictionary form (`gulvet` -> `gulv`). The proposal lands in the Danish field's own
   * correction box, where it stays until it is acted on; the toast only says why the save
   * stopped. Pressing Save again keeps the text exactly as typed.
   *
   * Phrases and sentences are not judged here — COR holds no multi-word expressions, and
   * `Verify phrase` / `Verify sentence` is what checks those.
   */
  async function verifyDanishBeforeSave(rows: CorForm[], danish: string, senses: EntrySense[]): Promise<boolean> {
    if (inferDanishInputKind(danish) !== 'word' || saveAnyway.current === danish) return true
    // Editing an entry whose Danish has not changed: this word was already ruled on when it was
    // saved, and re-refusing it would make every later edit to the meanings cost two presses.
    if (editing && entry?.danish.trim() === danish) return true

    if (!isKnownDanishForm(rows)) {
      const suggestion = await firstSpellingSuggestion(danish)
      if (suggestion) {
        recordDanishCheck({ text: danish, checked: danish, kind: 'word', status: 'suggestion', suggestion })
        notify(`“${danish}” is not a Danish word. Did you mean “${suggestion}”?`, 'warning')
      } else {
        notify(`“${danish}” is not in the Danish word register. Save again to keep it.`, 'warning')
      }
      saveAnyway.current = danish
      return false
    }

    const base = corBaseForm(rows, corLookupForm(danish), [...new Set(senses.map((sense) => sense.pos).filter((pos) => pos !== null))])
    if (!base) return true

    recordDanishCheck({ text: danish, checked: danish, kind: 'word', status: 'suggestion', suggestion: base })
    notify(`“${danish}” is not the base form — the correction is under the Danish field.`, 'warning')
    saveAnyway.current = danish
    return false
  }

  /** The local dictionary's best correction for a word it does not know, if it offers one. */
  async function firstSpellingSuggestion(danish: string): Promise<string | null> {
    try {
      const response = await fetch('/api/danish/spell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: danish }),
        // A suggestion is a nicety on the save path; the save must never wait on it.
        signal: AbortSignal.timeout(2500),
      })
      if (!response.ok) return null
      const [found] = readMisspellings(await readJsonRecord(response))
      return found?.suggestions[0] || null
    } catch {
      return null
    }
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
    if (aiLoading) return notify('Wait for the AI check to finish.')
    const current = draftRef.current
    if (!current.danish.trim()) return notify('Danish text is required.')
    const senses = activeSenses(current.senses).map((sense) => ({ ...sense, text: sense.text.trim() }))
    if (!senses.length) return notify('Add a translation or use AI to fill it.')

    setSaving(true)
    const supabase = createClient()

    // One read of the word register, used twice: to refuse a word that is misspelled or not in
    // its dictionary form, and to fill in a noun's gender, which is a recorded fact rather than
    // something to press Grammar for (issue #5 §1). COR stays silent unless its candidates for
    // this form agree, so nothing here can write a wrong `en`/`et`.
    //
    // It runs before the duplicate lookup on purpose: the corrected word is the one worth asking
    // about, and a learner who typed `gulvet` should not be told twice, once per check.
    const corForms = await fetchCorForms(supabase, current.danish.trim())
    if (!await verifyDanishBeforeSave(corForms, current.danish.trim(), senses)) {
      setSaving(false)
      return
    }
    const graded = fillCorGender(senses, corForms)

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
    const primaryId = graded[0]?.id
    const payload = {
      danish: current.danish.trim(),
      pronunciation: current.pronunciation.trim() || null,
      translation: translationFromSenses(graded),
      // Soft-deleted senses ride along so their ids stay resolvable (D15).
      senses: [
        ...graded.map((sense) => sense.id === primaryId
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
        notify('Could not save this entry. Please try again.', 'error')
        setSaving(false)
        return
      }

      const saved = updated as VocabularyEntry
      exampleSentenceDirty.current = false
      latestExampleSentence.current = saved.example_sentence || ''
      resetExampleCheck()
      savedSenseIds.current = new Set(parseSenses(saved.senses).map((sense) => sense.id))
      saveAnyway.current = ''
      resetDraft(draftFromEntry(saved), archivedFromEntry(saved))
      setUndoSnapshot(null)
      setUsedAI(false)
      notify('Saved. Your changes are live.', 'success')
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
      notify('Could not save this entry. Please try again.', 'error')
      setSaving(false)
      return
    }

    if (savedEntry?.id) runSynonymDiscovery(savedEntry.id, savedEntry.entry_kind)

    exampleSentenceDirty.current = false
    latestExampleSentence.current = ''
    saveAnyway.current = ''
    resetExampleCheck()
    resetDraft(blankDraft(), [])
    setEntryKind('word')
    setIncludeExample(false)
    setExamplePreferenceTouched(false)
    setUndoSnapshot(null)
    setDuplicate(null)
    setLiveDuplicate([])
    setAllowDuplicate(false)
    setUsedAI(false)
    notify('Saved. It is ready for review.', 'success')
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
  const hasDanish = Boolean(draft.danish.trim())
  const danishActionLabel = inputKind === 'word' ? 'Base form' : inputKind === 'phrase' ? 'Verify phrase' : 'Verify sentence'
  const currentCheck = danishCheck && danishCheck.text === draft.danish.trim() ? danishCheck : null
  const verified = currentCheck && ['correct', 'applied', 'changed'].includes(currentCheck.status)
  const kindName = inputKind === 'word' ? 'Word' : inputKind === 'phrase' ? 'Phrase' : 'Sentence'
  const languageLabel = translationLanguage === 'ru' ? 'Russian' : translationLanguage === 'en' ? 'English' : 'Ukrainian'
  const translationLabel = entryKind === 'sentence' ? 'Translation' : `${languageLabel} meanings`
  const translationPlaceholder = entryKind === 'sentence'
    ? translationLanguage === 'ru' ? 'Как дела?' : translationLanguage === 'uk' ? 'Як справи?' : 'How are you?'
    : translationLanguage === 'ru' ? 'думать, считать' : translationLanguage === 'uk' ? 'думати, вважати' : 'think'
  const liveSenses = activeSenses(draft.senses)
  const exampleFieldLabel = editing && liveSenses.length > 1 ? 'Example · primary meaning' : 'Example'
  const saveLabel = editing
    ? 'Save changes'
    : entryKind === 'sentence' ? 'Save sentence' : inputKind === 'phrase' ? 'Save phrase' : 'Save word'
  // Details appear once there is something to describe (progressive disclosure). Anything already
  // filled in stays visible even if the Danish is cleared, so nothing typed is ever hidden.
  const showDetails = editing || hasDanish || Boolean(draft.pronunciation.trim() || translationFromSenses(draft.senses).trim() || draft.example_sentence.trim() || draft.example_translation.trim())
  const aiBusy = Boolean(aiLoading)
  const exampleOn = entryKind !== 'sentence' && includeExample

  function runAi(action: () => unknown): void {
    setAiMenuOpen(false)
    void action()
  }

  return (
    <section className={`composer-card capture-focus${editing ? ' entry-editor-card' : ''}`} onKeyDown={keyDown}>
      <div className="composer-heading">
        <div>
          <span className="eyebrow"><Sparkles size={14} /> {editing ? 'EDIT ENTRY' : 'QUICK CAPTURE'}</span>
          <h2>{editing ? 'Edit this entry' : 'Add Danish'}</h2>
        </div>
        {compact && <button className="icon-button" onClick={() => setOpen(false)} aria-label="Close"><X size={18} /></button>}
      </div>

      <div className="capture-hero">
        <AutoGrowTextarea
          inputRef={firstInput}
          className="capture-danish"
          value={draft.danish}
          onChange={(e) => patch('danish', e.target.value)}
          placeholder="Type Danish…"
          aria-label="Danish word, phrase, or sentence"
          lang="da"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        {showDetails && (
          <AutoGrowTextarea
            className="capture-pron"
            value={draft.pronunciation}
            onChange={(e) => patch('pronunciation', e.target.value)}
            placeholder="pronunciation · сюнес"
            aria-label="Simplified pronunciation (Cyrillic)"
          />
        )}
        {hasDanish && (
          <div className="capture-meta">
            <button
              type="button"
              className={`capture-kind${verified ? ' ok' : ''}`}
              disabled={aiBusy}
              onClick={() => void checkDanishForm()}
              aria-label={danishActionLabel}
            >
              {aiLoading === 'danish-check' ? <Loader2 className="spin" size={13} /> : verified ? <Check size={13} /> : <Sparkles size={13} />}
              <span className="capture-kind-name">{kindName} ·</span>
              {verified ? (inputKind === 'word' ? 'Base form' : 'Correct') : danishActionLabel}
            </button>
            {liveDuplicate.length > 0 && (
              <small className="capture-duplicate">
                <CircleAlert size={12} />
                <span>Already saved</span>
                <span className="capture-duplicate-meanings">· {duplicateMeanings.join(' · ')}</span>
              </small>
            )}
          </div>
        )}
        {currentCheck && <DanishCheckNotice check={currentCheck} onApply={applyDanishSuggestion} onDismiss={() => recordDanishCheck({ ...currentCheck, status: 'dismissed' })} />}
      </div>

      {!showDetails && <p className="capture-empty-note">Type a word, phrase or sentence. Its pronunciation, meaning and an example appear here.</p>}

      {showDetails && (
        <div className="capture-section capture-reveal">
          <div className="capture-section-head"><span>{translationLabel}</span></div>

          {/* A sentence has exactly one meaning (plan §3.2): a plain field, no meaning card. */}
          {entryKind === 'sentence' && draft.senses[0] ? (
            <AutoGrowTextarea
              className="sentence-translation capture-bare"
              value={draft.senses[0].text}
              onChange={(e) => updateSense(draft.senses[0].id, { text: e.target.value })}
              placeholder={translationPlaceholder}
              aria-label="Sentence translation"
            />
          ) : <>
            <div className="sense-list">
              {draft.senses.map((sense, index) => (
                <SenseRow
                  key={sense.id}
                  sense={sense}
                  index={index}
                  total={draft.senses.length}
                  isPrimary={sense.id === primaryId}
                  showGrammar
                  allowRemove={draft.senses.length > 1}
                  placeholder={index === 0 ? translationPlaceholder : 'another meaning'}
                  translationLanguage={translationLanguage}
                  // Own examples only exist once the entry does, and never on the primary sense,
                  // which reads the entry's example columns instead (D10).
                  exampleState={editing && sense.id !== primaryId ? {
                    loading: aiLoading === `sense-example:${sense.id}`,
                    disabled: aiBusy,
                    onGenerate: () => void generateSenseExample(sense.id, false),
                    onRegenerate: () => void generateSenseExample(sense.id, true),
                    onChange: (patchSense) => setSenseExample(sense.id, patchSense),
                    onClear: () => setSenseExample(sense.id, { example: null, example_translation: null }),
                  } : null}
                  grammarState={{
                    loading: aiLoading === `sense-grammar:${sense.id}`,
                    disabled: aiBusy || !sense.text.trim() || !hasDanish,
                    onClassify: () => void classifySenseGrammar(sense.id),
                  }}
                  onText={(value) => updateSense(sense.id, { text: value })}
                  onPos={(value) => setSensePos(sense.id, value)}
                  onGender={(value) => setSenseGender(sense.id, value)}
                  onMove={(delta) => moveSense(sense.id, delta)}
                  onRemove={() => removeSense(sense.id)}
                />
              ))}
            </div>
            <button type="button" className="sense-add" onClick={addSense}>
              <Plus size={15} /> Add meaning
            </button>
          </>}
        </div>
      )}

      {showDetails && entryKind !== 'sentence' && (exampleOn ? (
        <div className="capture-section capture-reveal">
          <div className="capture-section-head">
            <span>{exampleFieldLabel}</span>
            <span className="capture-section-tools">
              {aiLoading === 'example-check' && <small><Loader2 className="spin" size={11} /> Checking…</small>}
              <button type="button" className="capture-link danger" onClick={() => setExampleEnabled(false)}>Remove</button>
            </span>
          </div>
          <AutoGrowTextarea
            className="capture-bare"
            lang="da"
            value={draft.example_sentence}
            onChange={(e) => {
              exampleSentenceDirty.current = true
              patch('example_sentence', e.target.value)
            }}
            onBlur={(e) => {
              const nextTarget = e.relatedTarget as HTMLElement | null
              if (!exampleSentenceDirty.current || !draft.example_sentence.trim() || nextTarget?.closest('.capture-ai') || nextTarget?.closest('.example-correction-action')) return
              exampleSentenceDirty.current = false
              void checkExampleSentence()
            }}
            placeholder="Jeg synes, det er godt."
            aria-label="Example sentence"
          />
          <AutoGrowTextarea
            className="capture-bare sub"
            value={draft.example_translation}
            onChange={(e) => patch('example_translation', e.target.value)}
            placeholder={translationLanguage === 'ru' ? 'Я думаю, что это хорошо.' : translationLanguage === 'uk' ? 'Я думаю, що це добре.' : 'I think it is good.'}
            aria-label="Example translation"
          />
          {exampleSpelling.length > 0 && !exampleSuggestion && (
            <div className="danish-check spelling">
              <small>Not in the Danish dictionary</small>
              <ul>
                {exampleSpelling.map((item) => (
                  <li key={item.word}>
                    <span lang="da">{item.word}</span>
                    {item.suggestions.slice(0, 2).map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        lang="da"
                        className="soft-button example-correction-action"
                        onClick={(e) => { e.preventDefault(); applySpellingFix(item.word, suggestion) }}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {exampleCheckStatus === 'correct' && !exampleSuggestion && !exampleSpelling.length && (
            <small className="danish-check correct"><Check size={12} /> Grammar and spelling look good.</small>
          )}
          {exampleSuggestion && (
            <div className="danish-check suggestion">
              <small>Suggested correction</small>
              <p lang="da">{exampleSuggestion}</p>
              <div>
                <button type="button" className="soft-button strong example-correction-action" onClick={(e) => { e.preventDefault(); applyExampleSuggestion() }}><Check size={13} /> Use correction</button>
                <button type="button" className="soft-button example-correction-action" onClick={(e) => { e.preventDefault(); setExampleSuggestion(null); setExampleCheckStatus('idle') }}>Keep mine</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <button type="button" className="capture-disclose capture-reveal" onClick={() => setExampleEnabled(true)}>
          <Plus size={16} /> Add example sentence
        </button>
      ))}

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

      {/* One quiet AI button and one prominent Save (HIG: one or two prominent buttons per view).
          On a phone the bar sticks above the tab bar while the form scrolls. */}
      <div className="capture-actions">
        <div className="capture-ai">
          <button
            type="button"
            className="capture-ai-button"
            aria-haspopup="menu"
            aria-expanded={aiMenuOpen}
            onClick={() => setAiMenuOpen((value) => !value)}
          >
            {aiBusy && aiLoading !== 'example-check' ? <Loader2 className="spin" size={17} /> : <Sparkles size={17} />}
            AI
          </button>
          {aiMenuOpen && (
            <>
              <button type="button" className="capture-ai-backdrop" aria-label="Close AI actions" onClick={() => setAiMenuOpen(false)} />
              <div className="capture-ai-sheet" role="menu" aria-label="AI for this entry" onKeyDown={(e) => { if (e.key === 'Escape') setAiMenuOpen(false) }}>
                <span className="capture-ai-grab" aria-hidden="true" />
                <small>AI for this entry</small>
                <button type="button" role="menuitem" disabled={aiBusy || !hasDanish} onClick={() => runAi(fillMissingWithAI)}><WandSparkles size={17} />Fill missing fields</button>
                <button type="button" role="menuitem" disabled={aiBusy || !hasDanish} onClick={() => runAi(regenerateAll)}><RotateCcw size={17} />Regenerate everything</button>
                {/* The undo toast is gone within seconds; the way back has to outlive it. */}
                {undoSnapshot && <button type="button" role="menuitem" disabled={aiBusy} onClick={() => { setAiMenuOpen(false); undoRegenerate() }}><Undo2 size={17} />Undo regenerate</button>}
                <hr />
                <button type="button" role="menuitem" disabled={aiBusy || !hasDanish} onClick={() => runAi(checkDanishForm)}><Check size={17} />{danishActionLabel}</button>
                <button type="button" role="menuitem" disabled={aiBusy || !hasDanish} onClick={() => runAi(() => enrich(['pronunciation']))}><Sparkles size={17} />Pronunciation only</button>
                <button type="button" role="menuitem" disabled={aiBusy || !hasDanish} onClick={() => runAi(() => enrich(['translation']))}><Sparkles size={17} />{entryKind === 'sentence' ? 'Translation only' : 'Meanings only'}</button>
                {exampleOn && <button type="button" role="menuitem" disabled={aiBusy || !hasDanish} onClick={() => runAi(() => enrich(['example_sentence', 'example_translation']))}><Sparkles size={17} />Example only</button>}
                <hr />
                <button type="button" role="menuitem" className="danger" disabled={saving || aiBusy} onClick={() => { setAiMenuOpen(false); clearDraft() }}><X size={17} />{editing ? 'Revert changes' : 'Clear form'}</button>
              </div>
            </>
          )}
        </div>
        <div className="save-wrap">
          <span className="keyboard-hint">⌘ Enter</span>
          <button className="primary-button" disabled={saving || aiBusy} onClick={save}>
            {saving ? <Loader2 className="spin" size={17} /> : <Plus size={17} />}
            {saveLabel}
          </button>
        </div>
      </div>

      {(notice || (undoSnapshot && undoToastOpen)) && (
        <div className="toast-stack">
          {undoSnapshot && undoToastOpen && (
            <Toast
              message="Regenerated every field."
              action={{ label: 'Undo', onAct: undoRegenerate, disabled: aiBusy }}
              onDismiss={() => setUndoToastOpen(false)}
            />
          )}
          {notice && <Toast message={notice.text} tone={notice.tone} onDismiss={() => setNotice(null)} />}
        </div>
      )}
    </section>
  )
}

interface DanishCheck {
  /** The Danish text this verdict applies to. */
  text: string
  /** The text that was actually sent to be checked. */
  checked: string
  kind: DanishInputKind
  /** `changed`: a word was brought to its base form. `applied`: a proposed correction was accepted. */
  status: 'correct' | 'suggestion' | 'changed' | 'applied' | 'dismissed'
  /** The correction for `suggestion`; the original text for `changed`. */
  suggestion: string | null
}

function DanishCheckNotice({ check, onApply, onDismiss }: { check: DanishCheck; onApply: () => void; onDismiss: () => void }) {
  if (check.status === 'dismissed') return null
  const noun = check.kind === 'word' ? 'Word' : check.kind === 'phrase' ? 'Phrase' : 'Sentence'
  if (check.status === 'suggestion' && check.suggestion) {
    const diff = diffAnswer(check.text, check.suggestion)
    return (
      <div className="field-wide danish-check suggestion" role="status">
        <small>{noun} needs a correction</small>
        <p lang="da">{diff.expected.map((part, index) => part.changed ? <mark key={index} className="diff-fixed">{part.text}</mark> : <span key={index}>{part.text}</span>)}</p>
        <p className="danish-check-original" lang="da">{diff.actual.map((part, index) => part.changed ? <mark key={index} className="diff-wrong">{part.text}</mark> : <span key={index}>{part.text}</span>)}</p>
        <div>
          <button type="button" className="soft-button strong" onClick={(event) => { event.preventDefault(); onApply() }}><Check size={13} /> Use correction</button>
          <button type="button" className="soft-button" onClick={(event) => { event.preventDefault(); onDismiss() }}>Keep mine</button>
        </div>
      </div>
    )
  }
  // A plain "correct" verdict is shown by the kind chip itself; only a change needs a sentence.
  if (check.status === 'correct') return null
  const message = check.status === 'changed' ? `Brought to base form (was “${check.suggestion}”).` : `${noun} corrected.`
  return <small className="field-wide danish-check correct" role="status"><Check size={12} /> {message}</small>
}
