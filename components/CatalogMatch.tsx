'use client'

import { useEffect, useState } from 'react'
import { ChevronRight, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { encounteredFormOf, lookupCatalog, unlockedDraft, type CatalogEntry, type CatalogMiss, type UnlockedDraft } from '@/lib/catalog'
import { LEARNER_LANGUAGE_NAMES } from '@/lib/learner-language'
import { inferDanishInputKind } from '@/lib/entry-kind'
import { PART_OF_SPEECH_LABELS } from '@/lib/senses'
import type { TranslationLanguage } from '@/lib/types'

/**
 * The catalog offer under the Danish field (issue #6 §7).
 *
 * The learner types what they saw; if the word was pre-built, its meanings appear and one tap
 * fills the composer. Nothing is written here — the composer is filled and the learner presses
 * Save, so §7's "never mutate before confirmation" still holds, and everything stays editable.
 *
 * An ambiguous form offers every reading the register knows rather than choosing one. `ved` is
 * genuinely two words, and showing both is showing two facts; picking one for the learner would
 * be the guess this whole issue exists to remove.
 *
 * The learner may have typed an inflection. The headword is what gets saved, and the typed form
 * is named as one of its forms only when the verified paradigm contains it (issue #14).
 *
 * Meanings come in the learner's language. One that has no wording in that language yet is
 * counted, not shown in another language; the headword can still be saved with the learner's own
 * meaning.
 *
 * A miss is said out loud rather than hidden. It means the word is rarer than the catalog's
 * depth, or is a phrase, which a lemma list cannot contain at all — both are useful to know, and
 * both fall through to the live AI path unchanged.
 */
const LOOKUP_DELAY_MS = 350

interface Props {
  danish: string
  lang: TranslationLanguage
  /** `senseId` is null when the learner will write the meaning themselves. */
  onUnlock: (draft: UnlockedDraft, lemma: string, senseId: string | null) => void
}

const MISS_NOTE: Record<CatalogMiss, string> = {
  rare: 'Not in the catalog — a rarer word. AI will build it when you save.',
  phrase: 'Phrases are not in the catalog. AI will build this one.',
  unknown: 'Not in the catalog yet. AI will build it when you save.',
}

export function CatalogMatch({ danish, lang, onUnlock }: Props): React.JSX.Element | null {
  const [candidates, setCandidates] = useState<CatalogEntry[]>([])
  const [miss, setMiss] = useState<CatalogMiss | null>(null)
  const [loading, setLoading] = useState(false)
  const [dismissed, setDismissed] = useState('')

  const text = danish.trim()

  useEffect(() => {
    if (!text || inferDanishInputKind(text) === 'sentence') {
      setCandidates([])
      setMiss(null)
      return
    }
    let cancelled = false
    setLoading(true)
    const timer = setTimeout(() => {
      void lookupCatalog(createClient(), text, lang).then((result) => {
        if (cancelled) return
        setCandidates(result.candidates)
        setMiss(result.miss)
        setLoading(false)
      })
    }, LOOKUP_DELAY_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
      setLoading(false)
    }
  }, [text, lang])

  if (!text || dismissed === text) return null
  if (loading && !candidates.length) return null

  if (!candidates.length) {
    return miss ? <small className="catalog-miss"><Sparkles size={12} />{MISS_NOTE[miss]}</small> : null
  }

  return (
    <div className="catalog-match" role="group" aria-label="Choose meaning">
      <span className="catalog-title">Choose meaning</span>
      {candidates.map((entry) => {
        const encountered = encounteredFormOf(entry, text)
        const languageName = LEARNER_LANGUAGE_NAMES[lang]
        const unlock = (senseId: string | null): void => {
          onUnlock(unlockedDraft(entry, senseId), entry.lemma, senseId)
          setDismissed(text)
        }
        return (
          <div key={`${entry.lemma}:${entry.kind}`} className="catalog-candidate">
            {(candidates.length > 1 || !encountered.isHeadword) && (
              <div className="catalog-candidate-head">
                <strong>{entry.lemma}</strong>
                {entry.pos && <span className="catalog-pos">{PART_OF_SPEECH_LABELS[entry.pos]}</span>}
                {entry.pronunciation && <span className="catalog-pron">{entry.pronunciation}</span>}
              </div>
            )}
            {!encountered.isHeadword && (
              <p className="catalog-encountered">
                {encountered.verified ? <>Saves as <strong lang="da">{entry.lemma}</strong>, with <strong lang="da">{encountered.text}</strong> among its forms.</> : <>Saves as <strong lang="da">{entry.lemma}</strong>.</>}
              </p>
            )}
            {entry.forms.length > 0 && <p className="catalog-form-preview">{entry.forms.length} recorded forms · {entry.forms.filter((form) => form.form_text !== entry.lemma).slice(0, 3).map((form) => form.form_text).join(' · ') || entry.lemma}</p>}
            <div className="catalog-senses">
              {entry.senses.map((sense) => (
                <button key={sense.sense_id} type="button" className="catalog-sense" onClick={() => unlock(sense.sense_id)}>
                  <span>{sense.text}</span>
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              ))}
              {!entry.senses.length && (
                <button type="button" className="catalog-sense" onClick={() => unlock(null)}>
                  <span>Use “{entry.lemma}” and write the meaning</span>
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              )}
            </div>
            {entry.missing.length > 0 && (
              <small className="catalog-missing">
                {entry.missing.length === 1 ? 'One meaning is' : `${entry.missing.length} meanings are`} not yet available in {languageName}.
              </small>
            )}
          </div>
        )
      })}
    </div>
  )
}
