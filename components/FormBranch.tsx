import { formLabel, sortedForms, type WordForm } from '@/lib/word-forms'

type DisplayForm = { text: string; gender: string; gloss: string | null; roles: string[] }

function displayedForms(forms: readonly WordForm[]): DisplayForm[] {
  const grouped = new Map<string, DisplayForm>()
  for (const form of sortedForms(forms)) {
    const key = JSON.stringify([form.form_text, form.gender, form.gloss])
    const role = formLabel(form.form_key)
    const existing = grouped.get(key)
    if (existing) existing.roles.push(role)
    else grouped.set(key, { text: form.form_text, gender: form.gender, gloss: form.gloss, roles: [role] })
  }
  return [...grouped.values()]
}

export function FormBranch({ forms, headword, compact = false, showHeading = true }: { forms: readonly WordForm[]; headword: string; compact?: boolean; showHeading?: boolean }): React.JSX.Element | null {
  const branches = displayedForms(forms)
  if (!branches.length) return null
  return <div className={`form-branch${compact ? ' compact' : ''}`}>
    {showHeading && <span className="form-branch-heading">Forms <small>{compact ? <>For recognition · rate only {headword}</> : 'Recorded for this word'}</small></span>}
    <div className="form-branch-list">{branches.map((form) => <div className="form-branch-row" key={JSON.stringify([form.text, form.gender, form.gloss])}><span className="form-branch-role">{form.roles.join(' · ')}</span><strong lang="da">{form.text}{form.gender && <small> · {form.gender}</small>}</strong>{form.gloss && <span className="form-branch-gloss">{form.gloss}</span>}</div>)}</div>
  </div>
}
