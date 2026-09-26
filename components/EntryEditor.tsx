'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, CircleAlert, Loader2, Plus, Sparkles, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { AutoGrowTextarea } from '@/components/AutoGrowTextarea'
import { CatalogMatch } from '@/components/CatalogMatch'
import { useI18n } from '@/components/I18nProvider'
import { catalogMerge, findSavedCatalogWord, type CatalogPick, type SavedCatalogWord } from '@/lib/catalog'
import { DEFAULT_LEARNER_LANGUAGE } from '@/lib/learner-language'
import { SenseRow } from '@/components/SenseRow'
import { Toast, type ToastTone } from '@/components/Toast'
import { readJsonRecord, readMisspellings } from '@/lib/api-responses'
import { diffAnswer } from '@/lib/answer-diff'
import { corBaseForm, corLookupForm, fetchCorForms, fillCorGender, isKnownDanishForm, syncCorParadigm, type CorForm } from '@/lib/cor'
import { replaceWordInText, type Misspelling } from '@/lib/danish-text'
import { inferDanishInputKind, inferEntryKind, type DanishInputKind } from '@/lib/entry-kind'
import { manualEntryVerdict, type CatalogStatus, type ManualEntryInput } from '@/lib/manual-entry'
import {
  activeSenses,
  createSense,
  entrySenses,
  lockedSenses,
  parseSenses,
  translationFromSenses,
} from '@/lib/senses'
import type { EntryKind, EntrySense, NounGender, PartOfSpeech, TranslationLanguage, VocabularyEntry } from '@/lib/types'
import { FORM_SECTIONS, type FormPartOfSpeech, type WordFormKey } from '@/lib/word-forms'

/**
 * The one editor behind both `Add Danish` and `/words/[id]` (D7). Add-new and edit-existing are
 * the same component; only the persistence ends differ.
 *
 * No model is called from here (issue #25). A catalog word is filled from the catalog; anything
 * else is entered entirely by hand — headword, grammar, forms, meanings, example, pronunciation —
 * and the learner is told before saving that it is checked by nothing and studied in Review only.
 */
export type EntryEditorMode = 'create' | 'edit'

interface Draft {
  danish: string
  pronunciation: string
  /** Recording copied from a catalog unlock. Manual entries receive it from the audio backfill. */
  audio_path: string | null
  /** Derived from `senses` and never edited directly; the write keeps the denormalized column set. */
  translation: string
  /** Live senses only. Soft-deleted ones live in `archived` so their ids survive (D15). */
  senses: EntrySense[]
  /** The primary sense's example: it owns `example_sentence` / `example_translation` (D10). */
  example_sentence: string
  example_translation: string
  /** The catalog row this draft was unlocked from, if any. Provenance only (issue #6 §5). */
  catalog_lemma: string | null
  /**
   * The paradigm a learner types for a word the catalog does not hold, keyed by form. Only a new
   * manual word carries these; a saved word's forms are edited on its page (`WordStructure`).
   */
  forms: Partial<Record<WordFormKey, string>>
}

type TextField = 'pronunciation' | 'example_sentence' | 'example_translation'
type DuplicateEntry = { id: string; danish: string; translation: string | null }

function hasParadigm(pos: PartOfSpeech | null | undefined): pos is FormPartOfSpeech {
  return Boolean(pos && pos in FORM_SECTIONS)
}

/** The first meaning's part of speech, when it is one with a paradigm to type in. */
function formPartOf(senses: readonly EntrySense[]): FormPartOfSpeech | null {
  const pos = activeSenses(senses).find((sense) => sense.pos)?.pos
  return hasParadigm(pos) ? pos : null
}

type CatalogDuplicate = SavedCatalogWord & { pick: CatalogPick; status: 'added' | 'already-saved' }

function blankDraft(): Draft {
  return {
    danish: '',
    pronunciation: '',
    audio_path: null,
    translation: '',
    senses: [createSense('')],
    example_sentence: '',
    example_translation: '',
    catalog_lemma: null,
    forms: {},
  }
}

function draftFromEntry(entry: VocabularyEntry): Draft {
  // `entrySenses` also covers rows written before the senses migration by splitting `translation`.
  const senses = entrySenses(entry)
  return {
    danish: entry.danish,
    pronunciation: entry.pronunciation || '',
    audio_path: entry.audio_path || null,
    translation: translationFromSenses(senses),
    senses: senses.length ? senses : [createSense('')],
    example_sentence: entry.example_sentence || '',
    example_translation: entry.example_translation || '',
    catalog_lemma: entry.catalog_lemma || null,
    forms: {},
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
  translationLanguage = DEFAULT_LEARNER_LANGUAGE,
}: {
  mode: EntryEditorMode
  entry?: VocabularyEntry | null
  compact?: boolean
  translationLanguage?: TranslationLanguage
}): React.JSX.Element {
  const editing = mode === 'edit' && Boolean(entry)
  const router = useRouter()
  const { t } = useI18n()

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
  const [duplicate, setDuplicate] = useState<DuplicateEntry[] | null>(null)
  const [liveDuplicate, setLiveDuplicate] = useState<DuplicateEntry[]>([])
  const [allowDuplicate, setAllowDuplicate] = useState(false)
  /**
   * The catalog meaning the learner picked, if the draft came from the catalog. `senseId` is null
   * when no meaning was supplied in their language and they are writing their own.
   */
  const catalogPick = useRef<{ lemma: string; senseId: string | null; forms: string[] } | null>(null)
  /**
   * A catalog word that is already in Material (spec #12, decision 11). It is never saved a second
   * time: the picked meaning is added to the saved entry instead, or it is already there.
   */
  const [catalogDuplicate, setCatalogDuplicate] = useState<CatalogDuplicate | null>(null)
  const [notice, setNotice] = useState<{ text: string; tone: ToastTone } | null>(null)
  /** Words the Danish dictionary does not know, shown while the learner is still typing (§3). */
  const [exampleSpelling, setExampleSpelling] = useState<Misspelling[]>([])
  /**
   * The word register's proposal for the Danish text, made when a save was stopped. It only
   * applies while the text is unchanged.
   */
  const [danishCheck, setDanishCheck] = useState<DanishCheck | null>(null)
  const danishCheckRef = useRef<DanishCheck | null>(null)
  /** Whether the catalog holds what is typed. A miss is what makes this a manual entry. */
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus>('idle')
  const firstInput = useRef<HTMLTextAreaElement>(null)

  /** Every draft write goes through `commitDraft`, so async save paths read the current draft. */
  const draftRef = useRef(draft)
  const archivedRef = useRef(archived)
  /**
   * Sense ids that exist in the database. Only these need soft-deleting: an id that was never
   * written cannot have an FSRS objective pointing at it, and leaving its tombstone behind
   * would just be noise. Refreshed on every successful save.
   */
  const savedSenseIds = useRef<Set<string>>(new Set(parseSenses(entry?.senses).map((sense) => sense.id)))
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
    // Route error lines are already in the learner's language; a network failure (TypeError) is not.
    setNotice({ text: error instanceof Error && !(error instanceof TypeError) ? error.message : fallback, tone: 'error' })
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
    setNotice(null)
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

  /**
   * Instant typo feedback on the example sentence (issue #5 §3).
   *
   * A local dictionary lookup, so it answers while the learner is still typing — no model, no key,
   * no cost. It is never a verdict: a word the dictionary does not know may still be right.
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

  /** Apply one dictionary suggestion to the example sentence, and drop it from the hint. */
  function applySpellingFix(word: string, replacement: string): void {
    commitDraft((current) => ({ ...current, example_sentence: replaceWordInText(current.example_sentence, word, replacement) }))
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

  function patch(key: 'danish' | TextField, value: string) {
    if (key === 'danish') {
      const nextKind = inferEntryKind(value)
      const becameSentence = nextKind === 'sentence' && entryKind !== 'sentence'

      commitDraft((current) => {
        const sourceChanged = value.trim() !== current.danish.trim()
        // A different word is no longer the catalog pick (a ref, so repeating this is harmless).
        if (sourceChanged) catalogPick.current = null
        const next = sourceChanged ? { ...current, danish: value, catalog_lemma: null, audio_path: null } : { ...current, danish: value }
        if (nextKind !== 'sentence') return next
        const collapsed = collapseForSentence(next)
        // Only the transition clears the example fields. Typing inside an entry that was
        // already a sentence must not keep wiping something the learner can still see.
        return becameSentence ? { ...collapsed, example_sentence: '', example_translation: '' } : collapsed
      })
      setEntryKind(nextKind)

      if (nextKind === 'sentence' || !examplePreferenceTouched) setIncludeExample(false)

      setDuplicate(null)
      setAllowDuplicate(false)
      setCatalogDuplicate(null)
    } else {
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

  function setForm(key: WordFormKey, value: string): void {
    commitDraft((current) => ({ ...current, forms: { ...current.forms, [key]: value } }))
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
      commitDraft((current) => ({ ...current, example_sentence: '', example_translation: '' }))
    }
  }

  function clearDraft() {
    setDuplicate(null)
    setLiveDuplicate([])
    setAllowDuplicate(false)
    catalogPick.current = null
    setCatalogDuplicate(null)
    setNotice(null)

    if (editing && entry) {
      // Editing an entry has no blank state to return to: revert to what is stored.
      resetDraft(draftFromEntry(entry), archivedFromEntry(entry))
      setEntryKind(entry.entry_kind || 'word')
      setIncludeExample(entry.entry_kind !== 'sentence' && Boolean(entry.example_sentence || entry.example_translation))
      notify(t.editor.reverted, 'success')
      return
    }

    resetDraft(blankDraft(), [])
    setEntryKind('word')
    setIncludeExample(false)
    setExamplePreferenceTouched(false)
    window.setTimeout(() => firstInput.current?.focus(), 0)
  }

  function recordDanishCheck(next: DanishCheck | null): void {
    danishCheckRef.current = next
    setDanishCheck(next)
  }

  function applyDanishSuggestion() {
    const check = danishCheckRef.current
    if (!check?.suggestion || check.status !== 'suggestion') return
    patch('danish', check.suggestion)
    recordDanishCheck({ ...check, text: check.suggestion, status: 'applied' })
  }

  /**
   * The primary sense reads the entry's example columns; every other sense carries its own
   * example (D10). When the primary sense changes, the two swap, or a reorder would leave the old
   * primary's example attached to a meaning that no longer owns those columns.
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
   * Check a single word against the word register before it is allowed to be saved.
   *
   * Two things are refused, both with a proposal the learner can take or leave: a word COR does
   * not know at all (the local dictionary suggests the nearest real words), and a word that is
   * not its dictionary form (`gulvet` -> `gulv`). The proposal lands in the Danish field's own
   * correction box, where it stays until it is acted on; the toast only says why the save
   * stopped. Pressing Save again keeps the text exactly as typed.
   *
   * Phrases and sentences are not judged here: COR holds no multi-word expressions.
   */
  async function verifyDanishBeforeSave(rows: CorForm[], danish: string, senses: EntrySense[]): Promise<boolean> {
    if (inferDanishInputKind(danish) !== 'word' || saveAnyway.current === danish) return true
    // Editing an entry whose Danish has not changed: this word was already ruled on when it was
    // saved, and re-refusing it would make every later edit to the meanings cost two presses.
    if (editing && entry?.danish.trim() === danish) return true

    if (!isKnownDanishForm(rows)) {
      const suggestion = await firstSpellingSuggestion(danish)
      if (suggestion) {
        recordDanishCheck({ text: danish, kind: 'word', status: 'suggestion', suggestion })
        notify(t.editor.notDanishDidYouMean(danish, suggestion), 'warning')
      } else {
        notify(t.editor.notInRegister(danish), 'warning')
      }
      saveAnyway.current = danish
      return false
    }

    const base = corBaseForm(rows, corLookupForm(danish), [...new Set(senses.map((sense) => sense.pos).filter((pos) => pos !== null))])
    if (!base) return true

    recordDanishCheck({ text: danish, kind: 'word', status: 'suggestion', suggestion: base })
    notify(t.editor.notBaseForm(danish), 'warning')
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

  /** What decides whether this is a manual entry (issue #25), read from the draft as it is now. */
  function manualInput(current: Draft): ManualEntryInput {
    return {
      editing,
      storedUnverified: entry?.unverified === true,
      danishChanged: current.danish.trim() !== (entry?.danish.trim() ?? ''),
      hasDanish: Boolean(current.danish.trim()),
      catalogLemma: current.catalog_lemma,
      catalogStatus,
      wroteMeaning: activeSenses(current.senses).some((sense) => sense.text.trim()),
    }
  }

  async function save() {
    const current = draftRef.current
    if (!current.danish.trim()) return notify(t.editor.danishRequired)
    // The catalog's answer decides whether the manual-entry warning is owed; never save past it.
    if (manualEntryVerdict(manualInput(current)) === 'pending') return notify(t.editor.checkingCatalog)
    const senses = activeSenses(current.senses).map((sense) => ({
      ...sense,
      text: sense.text.trim(),
      example: sense.example?.trim() || null,
      example_translation: sense.example_translation?.trim() || null,
    }))
    if (!senses.length) return notify(t.editor.addTranslation)

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

    // A catalog word already in Material gets its meaning added to the saved entry rather than a
    // second entry, card and history. Owner-scoped by RLS like every other Material read. The pick
    // is captured before the await, so an edit meanwhile cannot change what is being matched.
    const pick = catalogPick.current
    if (!editing && current.catalog_lemma && pick?.lemma === current.catalog_lemma) {
      const found = await findSavedCatalogWord(supabase, pick)
      if (found === 'error') {
        notify(t.editor.couldNotCheckMaterial, 'error')
        setSaving(false)
        return
      }
      if (found) {
        setCatalogDuplicate({ ...found, pick, status: catalogMerge(found.senses, current, pick).status })
        setSaving(false)
        return
      }
    }

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
      audio_path: current.audio_path,
      translation: translationFromSenses(graded),
      // Soft-deleted senses ride along so their ids stay resolvable (D15).
      senses: [
        ...graded.map((sense) => sense.id === primaryId
          // The primary sense reads the columns; storing a copy on the object too would let the
          // two drift apart (D10).
          ? { ...sense, example: null, example_translation: null }
          : sense),
        // Meanings the catalog supplied but the learner has not unlocked. They are stored so the
        // ids survive and they can be unlocked later, and `activeSenses` keeps them out of
        // everything that teaches or grades (issue #6 §7).
        ...lockedSenses(current.senses),
        ...archivedRef.current,
      ],
      example_sentence: storeExample ? current.example_sentence.trim() || null : null,
      example_translation: storeExample ? current.example_translation.trim() || null : null,
      entry_kind: entryKind,
      // `unverified` is not sent: the database decides it from `catalog_lemma` (issue #25).
      catalog_lemma: current.catalog_lemma,
    }

    if (editing && entry) {
      const { data: updated, error } = await supabase
        .from('vocabulary_entries')
        .update(payload)
        .eq('id', entry.id)
        .select('*')
        .single()

      if (error || !updated) {
        notify(t.editor.couldNotSave, 'error')
        setSaving(false)
        return
      }

      const saved = updated as VocabularyEntry
      if (entryKind === 'word' && !current.catalog_lemma) await syncCorParadigm(supabase, saved.id, saved.danish, graded)
      savedSenseIds.current = new Set(parseSenses(saved.senses).map((sense) => sense.id))
      saveAnyway.current = ''
      resetDraft(draftFromEntry(saved), archivedFromEntry(saved))
      notify(t.editor.savedLive, 'success')
      setSaving(false)
      router.refresh()
      return
    }

    const { data: savedEntry, error } = await supabase
      .from('vocabulary_entries')
      .insert({ ...payload, familiarity: 0 })
      .select('id, entry_kind')
      .single()

    if (error) {
      notify(t.editor.couldNotSave, 'error')
      setSaving(false)
      return
    }

    let formsSaved = true
    if (savedEntry?.id && entryKind === 'word' && !current.catalog_lemma) {
      // A paradigm the learner typed is theirs and stands as typed; with none typed, the word
      // register still records the forms it knows (issue #5).
      const typed = typedForms(current)
      if (typed.length) {
        // `gender: ''` is the table's "no gender": only register rows carry one.
        const { error: formsError } = await supabase.from('word_forms').insert(typed.map((form) => ({ ...form, entry_id: savedEntry.id, gender: '', source: 'user' })))
        formsSaved = !formsError
      } else {
        await syncCorParadigm(supabase, savedEntry.id, current.danish, graded)
      }
    }

    saveAnyway.current = ''
    resetDraft(blankDraft(), [])
    setEntryKind('word')
    setIncludeExample(false)
    setExamplePreferenceTouched(false)
    setDuplicate(null)
    setLiveDuplicate([])
    setAllowDuplicate(false)
    catalogPick.current = null
    notify(formsSaved ? t.editor.savedReady : t.editor.formsNotSaved, formsSaved ? 'success' : 'warning')
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
        <span><strong>{t.editor.addDanish}</strong><small>{t.editor.wordPhraseSentence}</small></span>
        <span className="keyboard-hint">⌘ K</span>
      </button>
    )
  }

  /**
   * Add the picked meaning to the saved word. The merge is recomputed from the draft as it is now,
   * and the write is conditional on `updated_at`, so an edit made elsewhere meanwhile wins. A
   * manually saved headword also gains its catalog provenance, which copies its verified forms.
   */
  async function addToSavedWord(): Promise<void> {
    if (!catalogDuplicate) return
    const merged = catalogMerge(catalogDuplicate.senses, draftRef.current, catalogDuplicate.pick)
    if (merged.status !== 'added') {
      setCatalogDuplicate({ ...catalogDuplicate, status: merged.status })
      return
    }
    setSaving(true)
    const adoptCatalog = !catalogDuplicate.catalogLemma && catalogDuplicate.danish.trim().toLocaleLowerCase('da-DK') === catalogDuplicate.pick.lemma
    const { data, error } = await createClient()
      .from('vocabulary_entries')
      .update({ senses: merged.senses, ...(adoptCatalog ? { catalog_lemma: catalogDuplicate.pick.lemma } : {}) })
      .eq('id', catalogDuplicate.id)
      .eq('updated_at', catalogDuplicate.updatedAt)
      .select('id')
    setSaving(false)
    if (error || !data?.length) {
      notify(t.editor.changedMeanwhile, 'error')
      return
    }
    const danish = catalogDuplicate.danish
    clearDraft()
    notify(t.editor.addedTo(danish), 'success')
    router.refresh()
  }

  const duplicateMeanings = [...new Set(liveDuplicate.map((item) => item.translation?.trim() || t.common.noTranslation))]
  // The primary sense is the first non-removed one: it owns the entry's example columns.
  const primaryId = activeSenses(draft.senses)[0]?.id ?? draft.senses[0]?.id ?? ''
  const inputKind = inferDanishInputKind(draft.danish)
  const hasDanish = Boolean(draft.danish.trim())
  const currentCheck = danishCheck && danishCheck.text === draft.danish.trim() ? danishCheck : null
  const kindName = t.editor.kindNames[inputKind]
  const translationLabel = entryKind === 'sentence' ? t.editor.translation : t.editor.meanings(t.languageNames[translationLanguage])
  const translationPlaceholder = entryKind === 'sentence' ? t.editor.placeholders.sentence : t.editor.placeholders.meaning
  const liveSenses = activeSenses(draft.senses)
  const exampleFieldLabel = editing && liveSenses.length > 1 ? t.editor.examplePrimary : t.common.example
  const saveLabel = editing
    ? t.editor.saveChanges
    : entryKind === 'sentence' ? t.editor.saveSentence : inputKind === 'phrase' ? t.editor.savePhrase : t.editor.saveWord
  // Details appear once there is something to describe (progressive disclosure). Anything already
  // filled in stays visible even if the Danish is cleared, so nothing typed is ever hidden.
  const showDetails = editing || hasDanish || Boolean(draft.pronunciation.trim() || translationFromSenses(draft.senses).trim() || draft.example_sentence.trim() || draft.example_translation.trim())
  const exampleOn = entryKind !== 'sentence' && includeExample
  const manual = manualEntryVerdict(manualInput(draft)) === 'manual'
  // A new manual word gets its paradigm typed here; a saved one is edited on its page.
  const formPart = !editing && manual && entryKind === 'word' && inputKind === 'word' ? formPartOf(draft.senses) : null

  return (
    <section className={`composer-card capture-focus${editing ? ' entry-editor-card' : ''}`} onKeyDown={keyDown}>
      <div className="composer-heading">
        <div>
          {!editing && <span className="eyebrow"><Sparkles size={14} /> {t.editor.quickCapture}</span>}
          <h2>{editing ? t.editor.editEntry : t.editor.addDanish}</h2>
        </div>
        {compact && <button className="icon-button" onClick={() => setOpen(false)} aria-label={t.common.close}><X size={18} /></button>}
      </div>

      <div className="capture-hero">
        <AutoGrowTextarea
          inputRef={firstInput}
          className="capture-danish"
          value={draft.danish}
          onChange={(e) => patch('danish', e.target.value)}
          placeholder={t.editor.placeholders.danish}
          aria-label={t.editor.danishAria}
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
            placeholder={t.editor.placeholders.pronunciation}
            aria-label={t.editor.pronunciationAria}
          />
        )}
        {hasDanish && (
          <div className="capture-meta">
            <span className="capture-kind">{kindName}</span>
            {liveDuplicate.length > 0 && (
              <small className="capture-duplicate">
                <CircleAlert size={12} />
                <span>{t.editor.alreadySaved}</span>
                <span className="capture-duplicate-meanings">· {duplicateMeanings.join(' · ')}</span>
              </small>
            )}
          </div>
        )}
        {currentCheck && <DanishCheckNotice check={currentCheck} onApply={applyDanishSuggestion} onDismiss={() => recordDanishCheck({ ...currentCheck, status: 'dismissed' })} />}
        {!editing && (
          <CatalogMatch
            danish={draft.danish}
            lang={translationLanguage}
            onStatus={setCatalogStatus}
            onUnlock={(unlocked, lemma, senseId, forms) => {
              catalogPick.current = { lemma, senseId, forms }
              setCatalogDuplicate(null)
              commitDraft((current) => ({
                ...current,
                ...unlocked,
                translation: translationFromSenses(unlocked.senses),
                catalog_lemma: lemma,
                // The catalog copies its verified forms on save; nothing typed competes with them.
                forms: {},
              }))
              setIncludeExample(Boolean(unlocked.example_sentence))
              notify(t.editor.filledFromCatalog, 'success')
            }}
          />
        )}
      </div>

      {!showDetails && <p className="capture-empty-note">{t.editor.emptyNote}</p>}

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
              aria-label={t.editor.sentenceTranslationAria}
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
                  placeholder={index === 0 ? translationPlaceholder : t.editor.placeholders.anotherMeaning}
                  // Own examples only exist once the entry does, and never on the primary sense,
                  // which reads the entry's example columns instead (D10).
                  exampleState={editing && sense.id !== primaryId ? {
                    onChange: (patchSense) => updateSense(sense.id, patchSense),
                    onClear: () => updateSense(sense.id, { example: null, example_translation: null }),
                  } : null}
                  onText={(value) => updateSense(sense.id, { text: value })}
                  onPos={(value) => setSensePos(sense.id, value)}
                  onGender={(value) => setSenseGender(sense.id, value)}
                  onMove={(delta) => moveSense(sense.id, delta)}
                  onRemove={() => removeSense(sense.id)}
                />
              ))}
            </div>
            <button type="button" className="sense-add" onClick={addSense}>
              <Plus size={15} /> {t.editor.addMeaning}
            </button>
          </>}
        </div>
      )}

      {formPart && (
        <div className="capture-section capture-reveal manual-forms">
          <div className="capture-section-head"><span>{t.editor.formsOf(t.formParts[formPart])}</span></div>
          {FORM_SECTIONS[formPart].map(([key]) => (
            <label key={key} className="manual-form-row">
              <span>{t.forms[key]}</span>
              <input
                lang="da"
                value={draft.forms[key] || ''}
                maxLength={200}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                onChange={(e) => setForm(key, e.target.value)}
                aria-label={t.editor.formAria(t.forms[key])}
              />
            </label>
          ))}
        </div>
      )}

      {showDetails && entryKind !== 'sentence' && (exampleOn ? (
        <div className="capture-section capture-reveal">
          <div className="capture-section-head">
            <span>{exampleFieldLabel}</span>
            <span className="capture-section-tools">
              <button type="button" className="capture-link danger" onClick={() => setExampleEnabled(false)}>{t.common.remove}</button>
            </span>
          </div>
          <AutoGrowTextarea
            className="capture-bare"
            lang="da"
            value={draft.example_sentence}
            onChange={(e) => patch('example_sentence', e.target.value)}
            placeholder="Jeg synes, det er godt."
            aria-label={t.editor.exampleAria}
          />
          <AutoGrowTextarea
            className="capture-bare sub"
            value={draft.example_translation}
            onChange={(e) => patch('example_translation', e.target.value)}
            placeholder={t.editor.placeholders.exampleTranslation}
            aria-label={t.editor.exampleTranslationAria}
          />
          {exampleSpelling.length > 0 && (
            <div className="danish-check spelling">
              <small>{t.editor.notInDictionary}</small>
              <ul>
                {exampleSpelling.map((item) => (
                  <li key={item.word}>
                    <span lang="da">{item.word}</span>
                    {item.suggestions.slice(0, 2).map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        lang="da"
                        className="soft-button"
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
        </div>
      ) : (
        <button type="button" className="capture-disclose capture-reveal" onClick={() => setExampleEnabled(true)}>
          <Plus size={16} /> {t.editor.addExample}
        </button>
      ))}

      {manual && (
        <div className="manual-entry-note capture-reveal" role="note">
          <CircleAlert size={16} aria-hidden="true" />
          <p><strong>{t.editor.manualTitle}</strong> {t.editor.manualBody}</p>
        </div>
      )}

      {catalogDuplicate && (
        <div className="duplicate-box">
          <div>
            <strong>{t.editor.alreadyInMaterial(catalogDuplicate.danish)}</strong>
            <span>{catalogDuplicate.status === 'already-saved' ? t.editor.alreadyHasMeaning : t.editor.addMeaningToIt}</span>
          </div>
          <div className="row-actions">
            <button className="soft-button" onClick={() => router.push(`/words/${catalogDuplicate.id}`)}>{t.editor.openExisting}</button>
            {catalogDuplicate.status === 'added' && <button className="soft-button strong" disabled={saving} onClick={() => void addToSavedWord()}>{t.editor.addThisMeaning}</button>}
          </div>
        </div>
      )}

      {duplicate && (
        <div className="duplicate-box">
          <div><strong>{t.editor.textExists}</strong><span>{duplicate.map((d) => d.translation || t.common.noTranslation).join(' · ')}</span></div>
          <div className="row-actions">
            {/* Straight to the entry, which is a real route now (D7) — a search for a sentence
                on the Words page used to find nothing. */}
            <button className="soft-button" onClick={() => router.push(`/words/${duplicate[0].id}`)}>{t.editor.openExisting}</button>
            <button className="soft-button strong" onClick={() => { setAllowDuplicate(true); setDuplicate(null) }}>{t.editor.addAnotherMeaning}</button>
          </div>
        </div>
      )}

      {/* One quiet secondary action and one prominent Save. On a phone the bar sticks above the
          tab bar while the form scrolls. */}
      <div className="capture-actions">
        {showDetails && (
          <button type="button" className="capture-clear" disabled={saving} onClick={clearDraft}>
            <X size={17} />{editing ? t.editor.revertChanges : t.editor.clearForm}
          </button>
        )}
        <div className="save-wrap">
          <span className="keyboard-hint">⌘ Enter</span>
          <button className="primary-button" disabled={saving} onClick={save}>
            {saving ? <Loader2 className="spin" size={17} /> : <Plus size={17} />}
            {saveLabel}
          </button>
        </div>
      </div>

      {notice && (
        <div className="toast-stack">
          <Toast message={notice.text} tone={notice.tone} onDismiss={() => setNotice(null)} />
        </div>
      )}
    </section>
  )
}

/** The typed paradigm, for the part of speech the word has now; stale keys and blanks are dropped. */
function typedForms(draft: Draft): { form_key: WordFormKey; form_text: string }[] {
  const part = formPartOf(draft.senses)
  if (!part) return []
  const seen = new Set<string>()
  return FORM_SECTIONS[part].flatMap(([key]) => {
    const text = (draft.forms[key] || '').trim().toLocaleLowerCase('da-DK')
    if (!text || seen.has(`${key}:${text}`)) return []
    seen.add(`${key}:${text}`)
    return [{ form_key: key, form_text: text }]
  })
}

interface DanishCheck {
  /** The Danish text this proposal applies to. */
  text: string
  kind: DanishInputKind
  /** `applied`: the proposed correction was accepted. */
  status: 'suggestion' | 'applied' | 'dismissed'
  suggestion: string | null
}

function DanishCheckNotice({ check, onApply, onDismiss }: { check: DanishCheck; onApply: () => void; onDismiss: () => void }) {
  const { t } = useI18n()
  if (check.status === 'dismissed') return null
  const noun = t.editor.kindNames[check.kind]
  if (check.status === 'suggestion' && check.suggestion) {
    const diff = diffAnswer(check.text, check.suggestion)
    return (
      <div className="field-wide danish-check suggestion" role="status">
        <small>{t.editor.needsCorrection(noun)}</small>
        <p lang="da">{diff.expected.map((part, index) => part.changed ? <mark key={index} className="diff-fixed">{part.text}</mark> : <span key={index}>{part.text}</span>)}</p>
        <p className="danish-check-original" lang="da">{diff.actual.map((part, index) => part.changed ? <mark key={index} className="diff-wrong">{part.text}</mark> : <span key={index}>{part.text}</span>)}</p>
        <div>
          <button type="button" className="soft-button strong" onClick={(event) => { event.preventDefault(); onApply() }}><Check size={13} /> {t.editor.useCorrection}</button>
          <button type="button" className="soft-button" onClick={(event) => { event.preventDefault(); onDismiss() }}>{t.editor.keepMine}</button>
        </div>
      </div>
    )
  }
  if (check.status !== 'applied') return null
  return <small className="field-wide danish-check correct" role="status"><Check size={12} /> {t.editor.corrected(noun)}</small>
}
