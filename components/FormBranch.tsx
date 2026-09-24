import { formLabel, sortedForms, type WordForm } from '@/lib/word-forms'

export function FormBranch({ forms, headword, compact = false }: { forms: readonly WordForm[]; headword: string; compact?: boolean }): React.JSX.Element | null {
  const branches = sortedForms(forms)
  if (!branches.length) return null
  return <div className={`form-branch${compact ? ' compact' : ''}`}>
    <span className="form-branch-heading">Forms <small>{compact ? <>For recognition · rate only {headword}</> : <>Recorded for this word</>}</small></span>
    <div className="form-branch-list">{branches.map((form) => <div className="form-branch-row" key={`${form.form_key}:${form.form_text}:${form.gender}`}><span className="form-branch-role">{formLabel(form.form_key)}</span><strong lang="da">{form.form_text}</strong>{form.gloss && <span className="form-branch-gloss">{form.gloss}</span>}</div>)}</div>
  </div>
}
