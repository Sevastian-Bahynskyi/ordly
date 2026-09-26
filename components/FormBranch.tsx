'use client'

import type { Messages } from '@/lib/i18n'
import { sortedForms, type WordForm } from '@/lib/word-forms'
import { useI18n } from './I18nProvider'

type DisplayForm = { text: string; gender: string; gloss: string | null; roles: string[] }

function displayedForms(t: Messages, forms: readonly WordForm[]): DisplayForm[] {
  const grouped = new Map<string, DisplayForm>()
  for (const form of sortedForms(forms)) {
    const key = JSON.stringify([form.form_text, form.gender, form.gloss])
    const role = t.forms[form.form_key]
    const existing = grouped.get(key)
    if (existing) existing.roles.push(role)
    else grouped.set(key, { text: form.form_text, gender: form.gender, gloss: form.gloss, roles: [role] })
  }
  return [...grouped.values()]
}

export function FormBranch({ forms, headword, compact = false, showHeading = true }: { forms: readonly WordForm[]; headword: string; compact?: boolean; showHeading?: boolean }): React.JSX.Element | null {
  const { t } = useI18n()
  const branches = displayedForms(t, forms)
  if (!branches.length) return null
  return <div className={`form-branch${compact ? ' compact' : ''}`}>
    {showHeading && <span className="form-branch-heading">{t.forest.forms} <small>{compact ? t.forest.forRecognition(headword) : t.forest.recorded}</small></span>}
    <div className="form-branch-list">{branches.map((form) => <div className="form-branch-row" key={JSON.stringify([form.text, form.gender, form.gloss])}><span className="form-branch-role">{form.roles.join(' · ')}</span><strong lang="da">{form.text}{form.gender && <small> · {form.gender}</small>}</strong>{form.gloss && <span className="form-branch-gloss">{form.gloss}</span>}</div>)}</div>
  </div>
}
