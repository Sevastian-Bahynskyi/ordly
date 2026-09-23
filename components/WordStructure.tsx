'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { inferDanishInputKind } from '@/lib/entry-kind'
import { activeSenses, parseSenses } from '@/lib/senses'
import type { VocabularyEntry } from '@/lib/types'
import { FORM_SECTIONS, type FormPartOfSpeech, type WordForm } from '@/lib/word-forms'
import { WordAudio } from './WordAudio'

type GroupEntry = Pick<VocabularyEntry, 'id' | 'danish' | 'translation' | 'entry_kind' | 'canonical_entry_id'>
type FormDraft = { text: string; audio: string }

const audioPathPattern = /^words\/[a-z0-9-]+\.mp3$/

export function WordStructure({ entry, entries, initialForms }: {
  entry: VocabularyEntry
  entries: GroupEntry[]
  initialForms: WordForm[]
}): React.JSX.Element {
  const router = useRouter()
  const [all, setAll] = useState(entries)
  const [rootChoice, setRootChoice] = useState('')
  const [memberChoice, setMemberChoice] = useState('')
  const [linking, setLinking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [savedForms, setSavedForms] = useState(initialForms)
  const [drafts, setDrafts] = useState<Record<string, FormDraft>>(() => Object.fromEntries(initialForms.map((form) => [form.form_key, { text: form.form_text, audio: form.audio_path || '' }])))

  const current = all.find((candidate) => candidate.id === entry.id) || entry
  const rootId = current.canonical_entry_id || entry.id
  const root = all.find((candidate) => candidate.id === rootId)
  const members = all.filter((candidate) => candidate.id !== rootId && candidate.canonical_entry_id === rootId)
  const rootOptions = all.filter((candidate) => candidate.id !== entry.id && inferDanishInputKind(candidate.danish) === 'word' && !candidate.canonical_entry_id)
  const memberOptions = all.filter((candidate) => candidate.id !== entry.id && inferDanishInputKind(candidate.danish) === 'word' && !candidate.canonical_entry_id && !all.some((other) => other.canonical_entry_id === candidate.id))
  const parts = [...new Set(activeSenses(parseSenses(entry.senses)).map((sense) => sense.pos).filter((part): part is FormPartOfSpeech => part === 'noun' || part === 'verb' || part === 'adjective'))]
  const formSections = (Object.keys(FORM_SECTIONS) as FormPartOfSpeech[]).filter((part) => parts.includes(part) || savedForms.some((form) => FORM_SECTIONS[part].some(([key]) => key === form.form_key)))

  async function setCanonical(targetId: string, canonicalId: string | null): Promise<void> {
    setLinking(true)
    setNotice('')
    const { error } = await createClient().from('vocabulary_entries').update({ canonical_entry_id: canonicalId }).eq('id', targetId)
    if (error) setNotice('Could not change the word group. Please try again.')
    else {
      setAll((currentEntries) => currentEntries.map((candidate) => candidate.id === targetId ? { ...candidate, canonical_entry_id: canonicalId } : candidate))
      setRootChoice('')
      setMemberChoice('')
      router.refresh()
    }
    setLinking(false)
  }

  async function saveForms(): Promise<void> {
    setSaving(true)
    setNotice('')
    const supabase = createClient()
    const next: WordForm[] = []
    for (const part of formSections) {
      for (const [key] of FORM_SECTIONS[part]) {
        const draft = drafts[key] || { text: '', audio: '' }
        const text = draft.text.trim()
        const audio = draft.audio.trim()
        if (audio && !text) {
          setNotice('Add the form before its audio path.')
          setSaving(false)
          return
        }
        if (audio && !audioPathPattern.test(audio)) {
          setNotice('Audio paths must look like words/example.mp3.')
          setSaving(false)
          return
        }
        if (text.length > 200) {
          setNotice('A form must be 200 characters or shorter.')
          setSaving(false)
          return
        }
        const old = savedForms.find((form) => form.form_key === key)
        if (!text && old) {
          const { error } = await supabase.from('word_forms').delete().eq('entry_id', entry.id).eq('form_key', key)
          if (error) {
            setNotice('Could not save forms. Please try again.')
            setSaving(false)
            return
          }
          continue
        }
        if (!text) continue
        if (old && old.form_text === text && (old.audio_path || '') === audio) {
          next.push(old)
          continue
        }
        const { data, error } = await supabase.from('word_forms').upsert({ entry_id: entry.id, form_key: key, form_text: text, audio_path: audio || null }, { onConflict: 'entry_id,form_key' }).select('*').single()
        if (error || !data) {
          setNotice('Could not save forms. Please try again.')
          setSaving(false)
          return
        }
        next.push(data as WordForm)
      }
    }
    setSavedForms(next)
    setSaving(false)
    setNotice('Forms saved.')
    router.refresh()
  }

  return <section className="composer-card word-structure">
    <div className="composer-heading"><div><span className="eyebrow">WORD STRUCTURE</span><h2>Related words and forms</h2><p>Keep separate meanings and review histories while linking words that belong together.</p></div></div>
    <div className="word-structure-section">
      <span className="eyebrow">WORD GROUP</span>
      {current.canonical_entry_id && root && <p>Canonical word: <Link href={`/words/${root.id}`}>{root.danish}</Link></p>}
      {members.length > 0 && <div className="word-structure-members">{members.map((member) => <Link key={member.id} href={`/words/${member.id}`}>{member.danish}<small>{member.translation || 'No meaning'}</small></Link>)}</div>}
      {!current.canonical_entry_id && !members.length && <p>This word is not grouped yet.</p>}
      {current.canonical_entry_id ? <div className="word-structure-action"><label>Canonical word<select value={rootChoice} onChange={(event) => setRootChoice(event.target.value)}><option value="">Choose another word</option>{rootOptions.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.danish} · {candidate.translation || 'No meaning'}</option>)}</select></label><button type="button" className="soft-button" disabled={!rootChoice || linking} onClick={() => void setCanonical(entry.id, rootChoice)}>Change</button><button type="button" className="soft-button" disabled={linking} onClick={() => void setCanonical(entry.id, null)}>Unlink</button></div>
        : <div className="word-structure-action"><label>Add a saved word<select value={memberChoice} onChange={(event) => setMemberChoice(event.target.value)}><option value="">Choose a word</option>{memberOptions.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.danish} · {candidate.translation || 'No meaning'}</option>)}</select></label><button type="button" className="soft-button" disabled={!memberChoice || linking} onClick={() => void setCanonical(memberChoice, entry.id)}>Link word</button></div>}
    </div>
    <div className="word-structure-section">
      <span className="eyebrow">FORMS</span>
      {!formSections.length && <p>Set a noun, verb, or adjective part of speech on a meaning to add its forms.</p>}
      {formSections.map((part) => <div className="word-form-section" key={part}><h3>{part[0].toUpperCase() + part.slice(1)}</h3>{FORM_SECTIONS[part].map(([key, label]) => {
        const draft = drafts[key] || { text: '', audio: '' }
        const base = key === 'positive' || key === 'infinitive' || key === 'indefinite_singular'
        return <div className="word-form-row" key={key}><label>{label}<input value={draft.text} placeholder={base ? entry.danish : label} maxLength={200} onChange={(event) => setDrafts((currentDrafts) => ({ ...currentDrafts, [key]: { ...draft, text: event.target.value } }))} /></label><label>Audio path (optional)<input value={draft.audio} placeholder="words/example.mp3" onChange={(event) => setDrafts((currentDrafts) => ({ ...currentDrafts, [key]: { ...draft, audio: event.target.value } }))} /></label>{draft.text.trim() && <WordAudio label={draft.text.trim()} audioPath={draft.audio.trim() || null} />}</div>
      })}</div>)}
      {formSections.length > 0 && <button type="button" className="soft-button" disabled={saving} onClick={() => void saveForms()}>{saving ? 'Saving…' : 'Save forms'}</button>}
    </div>
    {notice && <p role="status" className="word-structure-notice">{notice}</p>}
  </section>
}
