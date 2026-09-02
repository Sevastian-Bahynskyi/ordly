'use client'

import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types'

export function SettingsForm({ profile }: { profile: Profile & { current_streak?: number; longest_streak?: number } }) {
  const [language, setLanguage] = useState(profile.default_translation_language)
  const [level, setLevel] = useState(profile.danish_level)
  const [limit, setLimit] = useState(profile.daily_new_limit)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function save() {
    setSaving(true); setSaved(false)
    const { error } = await createClient().from('profiles').update({ default_translation_language: language, danish_level: level, daily_new_limit: limit }).eq('id', profile.id)
    setSaving(false)
    if (!error) setSaved(true)
  }

  return <section className="settings-card">
    <div className="setting-row"><div><strong>Translation language</strong><p>Used by AI and review prompts.</p></div><select value={language} onChange={(e) => setLanguage(e.target.value as typeof language)}><option value="ru">Russian</option><option value="en">English</option><option value="uk">Ukrainian</option></select></div>
    <div className="setting-row"><div><strong>Current Danish level</strong><p>AI sentences stay understandable without becoming childish.</p></div><select value={level} onChange={(e) => setLevel(e.target.value)}>{['A1','A2','B1','B2','C1'].map(x => <option key={x}>{x}</option>)}</select></div>
    <div className="setting-row"><div><strong>New words per day</strong><p>Due reviews are always shown first.</p></div><input className="number-input" type="number" min={1} max={50} value={limit} onChange={(e) => setLimit(Number(e.target.value))} /></div>
    <div className="settings-note"><strong>Scheduling</strong><p>FSRS controls review timing automatically. You rate each review as Again, Hard, Good, or Easy.</p></div>
    <button className="primary-button settings-save" onClick={save} disabled={saving}>{saving ? <Loader2 className="spin" size={17}/> : saved ? <Check size={17}/> : null}{saved ? 'Saved' : 'Save settings'}</button>
  </section>
}
