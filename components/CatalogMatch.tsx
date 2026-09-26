'use client'

import { useEffect, useState } from 'react'
import { ChevronRight, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useI18n } from '@/components/I18nProvider'
import { encounteredFormOf, lookupCatalog, unlockedDraft, type CatalogEntry, type CatalogMiss, type UnlockedDraft } from '@/lib/catalog'
import { inferDanishInputKind } from '@/lib/entry-kind'
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
  /**
   * `senseId` is null when the learner will write the meaning themselves. `forms` are the word's
   * verified spellings, used to find it in Material under any of them.
   */
  onUnlock: (draft: UnlockedDraft, lemma: string, senseId: string | null, forms: string[]) => void
}

export function CatalogMatch({ danish, lang, onUnlock }: Props): React.JSX.Element | null {
  const { t } = useI18n()
  const [candidates, setCandidates] = useState<CatalogEntry[]>([])
  const [miss, setMiss] = useState<CatalogMiss | null>(null)
  const [loading, setLoading] = useState(false)
  // Both the typed text and the headword it filled in: picking `stjernen` replaces the field with
  // `stjerne`, which must not reopen the same offer.
  const [dismissed, setDismissed] = useState<string[]>([])

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

  if (!text || dismissed.includes(text)) return null
  if (loading && !candidates.length) return null

  if (!candidates.length) {
    return miss ? <small className="catalog-miss"><Sparkles size={12} />{t.catalog.miss[miss]}</small> : null
  }

  return (
    <div className="catalog-match" role="group" aria-label={t.catalog.chooseMeaning}>
      <span className="catalog-title">{t.catalog.chooseMeaning}</span>
      {candidates.map((entry) => {
        const encountered = encounteredFormOf(entry, text)
        const unlock = (senseId: string | null): void => {
          onUnlock(unlockedDraft(entry, senseId), entry.lemma, senseId, entry.forms.map((form) => form.form_text))
          setDismissed([text, entry.lemma])
        }
        return (
          <div key={`${entry.lemma}:${entry.kind}`} className="catalog-candidate">
            {(candidates.length > 1 || !encountered.isHeadword) && (
              <div className="catalog-candidate-head">
                <strong>{entry.lemma}</strong>
                {entry.pos && <span className="catalog-pos">{t.pos[entry.pos]}</span>}
                {entry.pronunciation && <span className="catalog-pron">{entry.pronunciation}</span>}
              </div>
            )}
            {!encountered.isHeadword && (
              <p className="catalog-encountered">
                {encountered.verified ? <SavesAs parts={t.catalog.savesAsWith(entry.lemma, encountered.text)} /> : <SavesAs parts={t.catalog.savesAs(entry.lemma)} />}
              </p>
            )}
            {entry.forms.length > 0 && <p className="catalog-form-preview">{t.catalog.recordedForms(entry.forms.length)} · {entry.forms.filter((form) => form.form_text !== entry.lemma).slice(0, 3).map((form) => form.form_text).join(' · ') || entry.lemma}</p>}
            <div className="catalog-senses">
              {entry.senses.map((sense) => (
                <button key={sense.sense_id} type="button" className="catalog-sense" onClick={() => unlock(sense.sense_id)}>
                  <span>{sense.text}</span>
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              ))}
              {!entry.senses.length && (
                <button type="button" className="catalog-sense" onClick={() => unlock(null)}>
                  <span>{t.catalog.useAndWrite(entry.lemma)}</span>
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              )}
            </div>
            {entry.missing.length > 0 && (
              <small className="catalog-missing">
                {t.catalog.missing(entry.missing.length, t.languageNames[lang])}
              </small>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Interface text around Danish words, which are set in bold: text, word, text[, word, text]. */
function SavesAs({ parts }: { parts: readonly string[] }): React.JSX.Element {
  return <>{parts.map((part, index) => index % 2 ? <strong key={index} lang="da">{part}</strong> : <span key={index}>{part}</span>)}</>
}
