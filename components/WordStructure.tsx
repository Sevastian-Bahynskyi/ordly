'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { activeSenses, parseSenses } from '@/lib/senses'
import { FormBranch } from './FormBranch'
import { FORM_SECTIONS, formLabel, sortedForms, type FormPartOfSpeech, type WordForm, type WordFormKey } from '@/lib/word-forms'
import type { VocabularyEntry } from '@/lib/types'

export function WordStructure({ entry, initialForms }: { entry: VocabularyEntry; initialForms: WordForm[] }): React.JSX.Element {
  const router = useRouter()
  const [forms, setForms] = useState(initialForms)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [addKey, setAddKey] = useState<WordFormKey>('infinitive')
  const [addText, setAddText] = useState('')
  const [addGloss, setAddGloss] = useState('')
  const parts = [...new Set(activeSenses(parseSenses(entry.senses)).map((sense) => sense.pos).filter((part): part is FormPartOfSpeech => part === 'noun' || part === 'verb' || part === 'adjective' || part === 'pronoun'))]
  const keys = (Object.keys(FORM_SECTIONS) as FormPartOfSpeech[]).flatMap((part) => FORM_SECTIONS[part].map(([key, label]) => ({ key, label: `${part} · ${label}` })))

  async function addForm(): Promise<void> {
    const text = addText.trim().toLocaleLowerCase('da-DK')
    if (!text || text.length > 200) return
    if (forms.some((form) => form.form_key === addKey && form.form_text === text)) return setNotice('That form is already listed.')
    setSaving(true)
    const { data, error } = await createClient().from('word_forms').insert({ entry_id: entry.id, form_key: addKey, form_text: text, gender: '', source: 'user', gloss: addGloss.trim() || null }).select('*').single()
    if (error || !data) setNotice('Could not add the form.')
    else { setForms((current) => [...current, data as WordForm]); setAddText(''); setAddGloss(''); setNotice('Form added.'); router.refresh() }
    setSaving(false)
  }

  async function saveGloss(form: WordForm, gloss: string): Promise<void> {
    setSaving(true)
    const value = gloss.trim() || null
    const { error } = await createClient().from('word_forms').update({ gloss: value }).eq('entry_id', entry.id).eq('form_key', form.form_key).eq('form_text', form.form_text).eq('gender', form.gender)
    if (error) setNotice('Could not save the meaning.')
    else { setForms((current) => current.map((candidate) => candidate === form ? { ...candidate, gloss: value } : candidate)); setNotice('Meaning saved.'); router.refresh() }
    setSaving(false)
  }

  async function removeForm(form: WordForm): Promise<void> {
    setSaving(true)
    const { error } = await createClient().from('word_forms').delete().eq('entry_id', entry.id).eq('form_key', form.form_key).eq('form_text', form.form_text).eq('gender', form.gender)
    if (error) setNotice('Could not remove the form.')
    else { setForms((current) => current.filter((candidate) => candidate !== form)); router.refresh() }
    setSaving(false)
  }

  return <section className="composer-card word-structure">
    <div className="word-structure-heading"><div><span className="eyebrow">WORD FORMS</span><h2>{entry.danish}</h2><p>One word to review. Its forms are here whenever you need them.</p></div><button type="button" className="soft-button" onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Edit forms'}</button></div>
    <div className={`form-tree ${parts[0] ? `pos-${parts[0]}` : ''}`}><div className="form-tree-root"><strong lang="da">{entry.danish}</strong><span>{entry.translation}</span></div><FormBranch forms={forms} headword={entry.danish} />{forms.length === 0 && <p className="word-paradigm-empty">No forms recorded yet. Add a part of speech to a meaning, or add a form below.</p>}</div>
    {editing && <div className="word-form-editor"><div className="word-form-editor-list">{sortedForms(forms).map((form) => <FormEditRow key={`${form.form_key}:${form.form_text}:${form.gender}`} form={form} saving={saving} onSave={saveGloss} onRemove={removeForm} />)}</div><div className="word-form-add"><label>Form type<select value={addKey} onChange={(event) => setAddKey(event.target.value as WordFormKey)}>{keys.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}</select></label><label>Danish form<input value={addText} maxLength={200} onChange={(event) => setAddText(event.target.value)} placeholder="Type a form" /></label><label>Meaning for this form<input value={addGloss} maxLength={500} onChange={(event) => setAddGloss(event.target.value)} placeholder="Optional" /></label><button type="button" className="soft-button" disabled={saving || !addText.trim()} onClick={() => void addForm()}>Add form</button></div></div>}
    {notice && <p role="status" className="word-structure-notice">{notice}</p>}
  </section>
}

function FormEditRow({ form, saving, onSave, onRemove }: { form: WordForm; saving: boolean; onSave: (form: WordForm, gloss: string) => Promise<void>; onRemove: (form: WordForm) => Promise<void> }): React.JSX.Element {
  const [gloss, setGloss] = useState(form.gloss || '')
  return <div className="word-form-edit-row"><span>{formLabel(form.form_key)} · <strong>{form.form_text}</strong></span><input aria-label={`Meaning of ${form.form_text}`} value={gloss} maxLength={500} onChange={(event) => setGloss(event.target.value)} placeholder="Meaning for this form" /><button type="button" className="soft-button" disabled={saving || gloss.trim() === (form.gloss || '')} onClick={() => void onSave(form, gloss)}>Save</button>{form.source === 'user' && <button type="button" className="soft-button" disabled={saving} onClick={() => void onRemove(form)}>Remove</button>}</div>
}
