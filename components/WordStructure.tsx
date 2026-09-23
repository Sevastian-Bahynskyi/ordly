'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { inferDanishInputKind } from '@/lib/entry-kind'
import { activeSenses, parseSenses } from '@/lib/senses'
import type { VocabularyEntry } from '@/lib/types'
import { FORM_SECTIONS, type FormPartOfSpeech, type WordForm, type WordFormKey } from '@/lib/word-forms'
import { WordAudio } from './WordAudio'

type GroupEntry = Pick<VocabularyEntry, 'id' | 'danish' | 'translation' | 'entry_kind' | 'canonical_entry_id'>

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
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState('')
  const [forms, setForms] = useState(initialForms)
  const [addKey, setAddKey] = useState<WordFormKey>('infinitive')
  const [addText, setAddText] = useState('')
  const current = all.find((candidate) => candidate.id === entry.id) || entry
  const rootId = current.canonical_entry_id || entry.id
  const root = all.find((candidate) => candidate.id === rootId)
  const members = all.filter((candidate) => candidate.id !== rootId && candidate.canonical_entry_id === rootId)
  const rootOptions = all.filter((candidate) => candidate.id !== entry.id && inferDanishInputKind(candidate.danish) === 'word' && !candidate.canonical_entry_id)
  const memberOptions = all.filter((candidate) => candidate.id !== entry.id && inferDanishInputKind(candidate.danish) === 'word' && !candidate.canonical_entry_id && !all.some((other) => other.canonical_entry_id === candidate.id))
  const parts = [...new Set(activeSenses(parseSenses(entry.senses)).map((sense) => sense.pos).filter((part): part is FormPartOfSpeech => part === 'noun' || part === 'verb' || part === 'adjective' || part === 'pronoun'))]
  const hasClass = activeSenses(parseSenses(entry.senses)).some((sense) => sense.pos !== null)
  const formSections = (Object.keys(FORM_SECTIONS) as FormPartOfSpeech[]).filter((part) => parts.includes(part) || forms.some((form) => FORM_SECTIONS[part].some(([key]) => key === form.form_key)))
  const keys = formSections.flatMap((part) => FORM_SECTIONS[part].map(([key, label]) => ({ key, label })))

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

  async function addForm(): Promise<void> {
    const text = addText.trim().toLocaleLowerCase('da-DK')
    if (!text || text.length > 200) return
    if (forms.some((form) => form.form_key === addKey && form.form_text === text)) {
      setNotice('That form is already listed.')
      return
    }
    setSaving(true)
    setNotice('')
    const { data, error } = await createClient().from('word_forms').upsert({ entry_id: rootId, form_key: addKey, form_text: text, gender: '', source: 'user' }, { onConflict: 'entry_id,form_key,form_text,gender' }).select('*').single()
    if (error || !data) setNotice('Could not add the form. Please try again.')
    else {
      setForms((currentForms) => [...currentForms.filter((form) => !(form.form_key === addKey && form.form_text === text && form.gender === '')), data as WordForm])
      setAddText('')
      setNotice('Form added.')
      router.refresh()
    }
    setSaving(false)
  }

  async function removeForm(form: WordForm): Promise<void> {
    setSaving(true)
    const { error } = await createClient().from('word_forms').delete().eq('entry_id', rootId).eq('form_key', form.form_key).eq('form_text', form.form_text).eq('gender', form.gender)
    if (error) setNotice('Could not remove the form. Please try again.')
    else {
      setForms((currentForms) => currentForms.filter((candidate) => candidate !== form))
      router.refresh()
    }
    setSaving(false)
  }

  return <section className="composer-card word-structure">
    <div className="word-structure-heading"><div><span className="eyebrow">WORD FAMILY</span><h2>Forms of {root?.danish || entry.danish}</h2><p>Recorded forms stay together under their dictionary word. You can still add a form yourself.</p></div>{formSections.length > 0 && <button type="button" className="soft-button" onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Edit forms'}</button>}</div>
    <div className="word-paradigm">
      {!formSections.length && <p className="word-paradigm-empty">{hasClass ? 'No inflected forms are recorded for this word.' : 'Add its part of speech to a meaning to find recorded forms.'}</p>}
      {formSections.map((part) => <div className="word-paradigm-section" key={part}><h3>{part}</h3><div className="word-paradigm-list">{FORM_SECTIONS[part].map(([key, label]) => {
        const values = forms.filter((form) => form.form_key === key)
        if (!values.length && !editing) return null
        return <div className="word-paradigm-row" key={key}><span className="word-paradigm-label">{label}</span><div className="word-paradigm-values">{values.length ? values.map((form) => <span className="word-paradigm-value" key={`${form.form_text}:${form.gender}`}><span>{form.form_text}{form.gender && <small> · {form.gender}</small>}</span><WordAudio label={form.form_text} audioPath={form.audio_path} />{editing && form.source === 'user' && <button type="button" className="word-form-remove" disabled={saving} aria-label={`Remove ${form.form_text}`} onClick={() => void removeForm(form)}>×</button>}</span>) : <span className="word-paradigm-unavailable">—</span>}</div></div>
      })}</div></div>)}
    </div>
    {editing && <div className="word-form-add"><label>Form type<select value={addKey} onChange={(event) => setAddKey(event.target.value as WordFormKey)}>{keys.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}</select></label><label>Danish form<input value={addText} maxLength={200} onChange={(event) => setAddText(event.target.value)} placeholder="Type a form" /></label><button type="button" className="soft-button" disabled={saving || !addText.trim()} onClick={() => void addForm()}>Add form</button></div>}
    <details className="word-group-details"><summary>Related saved words{members.length ? ` · ${members.length}` : ''}</summary><p>Link a separately saved form while keeping its meaning and review history.</p>{current.canonical_entry_id && root && <p>Dictionary word: <Link href={`/words/${root.id}`}>{root.danish}</Link></p>}{members.length > 0 && <div className="word-structure-members">{members.map((member) => <Link key={member.id} href={`/words/${member.id}`}>{member.danish}<small>{member.translation || 'No meaning'}</small></Link>)}</div>}{current.canonical_entry_id ? <div className="word-structure-action"><label>Dictionary word<select value={rootChoice} onChange={(event) => setRootChoice(event.target.value)}><option value="">Choose another word</option>{rootOptions.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.danish} · {candidate.translation || 'No meaning'}</option>)}</select></label><button type="button" className="soft-button" disabled={!rootChoice || linking} onClick={() => void setCanonical(entry.id, rootChoice)}>Change</button><button type="button" className="soft-button" disabled={linking} onClick={() => void setCanonical(entry.id, null)}>Unlink</button></div> : <div className="word-structure-action"><label>Add a saved word<select value={memberChoice} onChange={(event) => setMemberChoice(event.target.value)}><option value="">Choose a word</option>{memberOptions.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.danish} · {candidate.translation || 'No meaning'}</option>)}</select></label><button type="button" className="soft-button" disabled={!memberChoice || linking} onClick={() => void setCanonical(memberChoice, entry.id)}>Link word</button></div>}</details>
    {notice && <p role="status" className="word-structure-notice">{notice}</p>}
  </section>
}
