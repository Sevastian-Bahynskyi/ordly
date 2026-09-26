'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { activeSenses, parseSenses } from '@/lib/senses'
import { inferDanishInputKind } from '@/lib/entry-kind'
import { FormBranch } from './FormBranch'
import { useI18n } from './I18nProvider'
import type { VocabularyEntry } from '@/lib/types'
import type { WordForm } from '@/lib/word-forms'

export function FormForest({ entries, forms, initialQuery = '' }: { entries: VocabularyEntry[]; forms: WordForm[]; initialQuery?: string }): React.JSX.Element {
  const { t } = useI18n()
  const [query, setQuery] = useState(initialQuery)
  const [selected, setSelected] = useState<string | null>(null)
  const focused = useRef<HTMLDivElement>(null)
  const byEntry = useMemo(() => {
    const result = new Map<string, WordForm[]>()
    for (const form of forms) result.set(form.entry_id, [...(result.get(form.entry_id) || []), form])
    return result
  }, [forms])
  const trees = useMemo(() => entries.filter((entry) => entry.entry_kind !== 'sentence' && inferDanishInputKind(entry.danish) === 'word' && !entry.canonical_entry_id && (byEntry.get(entry.id)?.length || 0) > 0).sort((a, b) => a.danish.localeCompare(b.danish, 'da')), [entries, byEntry])
  const matches = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('da-DK')
    if (!q) return trees
    return trees.filter((entry) => [entry.danish, entry.translation, ...(byEntry.get(entry.id) || []).flatMap((form) => [form.form_text, form.gloss])].some((text) => text?.toLocaleLowerCase('da-DK').includes(q)))
  }, [trees, byEntry, query])
  const active = selected && matches.some((entry) => entry.id === selected) ? selected : matches[0]?.id || null
  useEffect(() => { focused.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [active])
  const omitted = entries.filter((entry) => entry.entry_kind !== 'sentence' && inferDanishInputKind(entry.danish) === 'word').length - trees.length
  return <div className="form-forest">
    <p>{t.forest.intro}</p>
    <label className="search-box form-forest-search"><Search size={17}/><input value={query} onChange={(event) => { setQuery(event.target.value); setSelected(null) }} placeholder={t.forest.search} autoFocus /></label>
    <div className="form-forest-layout">
      <div className="form-forest-index" role="listbox" aria-label={t.forest.trees}>{matches.map((entry) => {
        const pos = activeSenses(parseSenses(entry.senses))[0]?.pos || 'none'
        return <button key={entry.id} type="button" role="option" aria-selected={active === entry.id} className={`form-forest-item pos-${pos}${active === entry.id ? ' active' : ''}`} onClick={() => setSelected(entry.id)}><strong lang="da">{entry.danish}</strong><small>{entry.translation}</small></button>
      })}{!matches.length && <p className="form-forest-empty">{t.forest.empty}</p>}</div>
      <div className="form-forest-detail" ref={focused}>{active && (() => {
        const entry = trees.find((candidate) => candidate.id === active)
        if (!entry) return null
        const pos = activeSenses(parseSenses(entry.senses))[0]?.pos || 'none'
        return <div className={`form-tree pos-${pos}`} key={entry.id}><span className="eyebrow">{pos === 'none' ? t.forest.word : t.pos[pos]}</span><div className="form-tree-root"><strong lang="da">{entry.danish}</strong><span>{entry.translation}</span></div><FormBranch forms={byEntry.get(entry.id) || []} headword={entry.danish} /><Link href={`/words/${entry.id}`}>{t.forest.openWord}</Link></div>
      })()}</div>
    </div>
    {omitted > 0 && <p className="form-forest-caption">{t.forest.omitted(omitted)}</p>}
  </div>
}
