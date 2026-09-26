'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { activeSenses, parseSenses } from '@/lib/senses'
import { FormBranch } from './FormBranch'
import { FORM_SECTIONS, sortedForms, type FormPartOfSpeech, type WordForm, type WordFormKey } from '@/lib/word-forms'
import { useI18n } from './I18nProvider'
import type { VocabularyEntry } from '@/lib/types'

export function WordStructure({ entry, initialForms }: { entry: VocabularyEntry; initialForms: WordForm[] }): React.JSX.Element {
  const router = useRouter()
  const { t } = useI18n()
  const [forms, setForms] = useState(initialForms)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [addKey, setAddKey] = useState<WordFormKey>('infinitive')
  const [addText, setAddText] = useState('')
  const [addGloss, setAddGloss] = useState('')
  const parts = [...new Set(activeSenses(parseSenses(entry.senses)).map((sense) => sense.pos).filter((part): part is FormPartOfSpeech => part === 'noun' || part === 'verb' || part === 'adjective' || part === 'pronoun'))]
  const keys = (Object.keys(FORM_SECTIONS) as FormPartOfSpeech[]).flatMap((part) => FORM_SECTIONS[part].map(([key]) => ({ key, label: `${t.formParts[part]} · ${t.forms[key]}` })))

  async function addForm(): Promise<void> {
    const text = addText.trim().toLocaleLowerCase('da-DK')
    if (!text || text.length > 200) return
    if (forms.some((form) => form.form_key === addKey && form.form_text === text)) return setNotice(t.structure.alreadyListed)
    setSaving(true)
    const { data, error } = await createClient().from('word_forms').insert({ entry_id: entry.id, form_key: addKey, form_text: text, gender: '', source: 'user', gloss: addGloss.trim() || null }).select('*').single()
    if (error || !data) setNotice(t.structure.couldNotAdd)
    else { setForms((current) => [...current, data as WordForm]); setAddText(''); setAddGloss(''); setNotice(t.structure.added); router.refresh() }
    setSaving(false)
  }

  async function saveGloss(form: WordForm, gloss: string): Promise<void> {
    setSaving(true)
    const value = gloss.trim() || null
    const { error } = await createClient().from('word_forms').update({ gloss: value }).eq('entry_id', entry.id).eq('form_key', form.form_key).eq('form_text', form.form_text).eq('gender', form.gender)
    if (error) setNotice(t.structure.couldNotSaveMeaning)
    else { setForms((current) => current.map((candidate) => candidate === form ? { ...candidate, gloss: value } : candidate)); setNotice(t.structure.meaningSaved); router.refresh() }
    setSaving(false)
  }

  async function removeForm(form: WordForm): Promise<void> {
    setSaving(true)
    const { error } = await createClient().from('word_forms').delete().eq('entry_id', entry.id).eq('form_key', form.form_key).eq('form_text', form.form_text).eq('gender', form.gender)
    if (error) setNotice(t.structure.couldNotRemove)
    else { setForms((current) => current.filter((candidate) => candidate !== form)); router.refresh() }
    setSaving(false)
  }

  const isCombiningElement = entry.danish.endsWith('-')

  return <section className={`composer-card word-structure${forms.length ? '' : ' word-structure-empty'}`}>
    <div className="word-structure-heading"><div><span className="eyebrow">{t.structure.eyebrow}</span><h2>{t.structure.title}</h2></div><button type="button" className="soft-button" onClick={() => setEditing(!editing)}>{editing ? t.common.done : t.structure.edit}</button></div>
    <div className={`form-tree ${parts[0] ? `pos-${parts[0]}` : ''}`}><div className="form-tree-root"><strong lang="da">{entry.danish}</strong><span>{entry.translation}</span></div><FormBranch forms={forms} headword={entry.danish} showHeading={false} />{forms.length === 0 && <p className="word-paradigm-empty">{isCombiningElement ? t.structure.compound : t.structure.noInflections}</p>}</div>
    {editing && <div className="word-form-editor"><div className="word-form-editor-list">{sortedForms(forms).map((form) => <FormEditRow key={`${form.form_key}:${form.form_text}:${form.gender}`} form={form} saving={saving} onSave={saveGloss} onRemove={removeForm} />)}</div><div className="word-form-add"><label>{t.structure.formType}<select value={addKey} onChange={(event) => setAddKey(event.target.value as WordFormKey)}>{keys.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}</select></label><label>{t.structure.danishForm}<input value={addText} maxLength={200} onChange={(event) => setAddText(event.target.value)} placeholder={t.structure.typeForm} /></label><label>{t.structure.meaningForForm}<input value={addGloss} maxLength={500} onChange={(event) => setAddGloss(event.target.value)} placeholder={t.common.optional} /></label><button type="button" className="soft-button" disabled={saving || !addText.trim()} onClick={() => void addForm()}>{t.structure.addForm}</button></div></div>}
    {notice && <p role="status" className="word-structure-notice">{notice}</p>}
  </section>
}

function FormEditRow({ form, saving, onSave, onRemove }: { form: WordForm; saving: boolean; onSave: (form: WordForm, gloss: string) => Promise<void>; onRemove: (form: WordForm) => Promise<void> }): React.JSX.Element {
  const { t } = useI18n()
  const [gloss, setGloss] = useState(form.gloss || '')
  return <div className="word-form-edit-row"><span>{t.forms[form.form_key]} · <strong>{form.form_text}</strong></span><input aria-label={t.structure.meaningOf(form.form_text)} value={gloss} maxLength={500} onChange={(event) => setGloss(event.target.value)} placeholder={t.structure.meaningForForm} /><button type="button" className="soft-button" disabled={saving || gloss.trim() === (form.gloss || '')} onClick={() => void onSave(form, gloss)}>{t.common.save}</button>{form.source === 'user' && <button type="button" className="soft-button" disabled={saving} onClick={() => void onRemove(form)}>{t.common.remove}</button>}</div>
}
