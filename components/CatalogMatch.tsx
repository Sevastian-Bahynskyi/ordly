'use client'

import { useEffect, useState } from 'react'
import { ChevronRight, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { lookupCatalog, unlockedDraft, type CatalogEntry, type CatalogMiss, type UnlockedDraft } from '@/lib/catalog'
import { inferDanishInputKind } from '@/lib/entry-kind'
import { PART_OF_SPEECH_LABELS } from '@/lib/senses'

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
 * A miss is said out loud rather than hidden. It means the word is rarer than the catalog's
 * depth, or is a phrase, which a lemma list cannot contain at all — both are useful to know, and
 * both fall through to the live AI path unchanged.
 */
const LOOKUP_DELAY_MS = 350

interface Props {
  danish: string
  onUnlock: (draft: UnlockedDraft, lemma: string) => void
}

const MISS_NOTE: Record<CatalogMiss, string> = {
  rare: 'Not in the catalog — a rarer word. AI will build it when you save.',
  phrase: 'Phrases are not in the catalog. AI will build this one.',
  unknown: 'Not in the catalog yet. AI will build it when you save.',
}

export function CatalogMatch({ danish, onUnlock }: Props): React.JSX.Element | null {
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
      void lookupCatalog(createClient(), text).then((result) => {
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
  }, [text])

  if (!text || dismissed === text) return null
  if (loading && !candidates.length) return null

  if (!candidates.length) {
    return miss ? <small className="catalog-miss"><Sparkles size={12} />{MISS_NOTE[miss]}</small> : null
  }

  return (
    <div className="catalog-match" role="group" aria-label="Choose meaning">
      <span className="catalog-title">Choose meaning</span>
      {candidates.map((entry) => (
        <div key={`${entry.lemma}:${entry.kind}`} className="catalog-candidate">
          {candidates.length > 1 && (
            <div className="catalog-candidate-head">
              <strong>{entry.lemma}</strong>
              {entry.pos && <span className="catalog-pos">{PART_OF_SPEECH_LABELS[entry.pos]}</span>}
              {entry.pronunciation && <span className="catalog-pron">{entry.pronunciation}</span>}
            </div>
          )}
          <div className="catalog-senses">
            {entry.senses.map((sense) => (
              <button
                key={sense.sense_id}
                type="button"
                className="catalog-sense"
                onClick={() => {
                  onUnlock(unlockedDraft(entry, sense.sense_id), entry.lemma)
                  setDismissed(text)
                }}
              >
                <span>{sense.text}</span>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
