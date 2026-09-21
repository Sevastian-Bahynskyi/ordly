'use client'

import { useRef, useState } from 'react'
import { Loader2, Volume2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

/**
 * Tap to hear the word (issue #6 §7).
 *
 * This narrowly reverses the AGENTS.md §19 line "do not bring back practice audio". What stays
 * removed is the old three-button Listen / Slower / Say-it-aloud practice mode, which was clutter
 * inside a timed exercise. One button on a word whose recording already exists is not that.
 *
 * The recording is DDO's, in a private bucket, reached through a short-lived signed URL: Ordly is
 * a single-user app and nothing here is re-published. A word with no recording renders nothing at
 * all rather than a dead button — DDO has no audio for every headword and none for a phrase, and
 * a silent word is still a good word (§6).
 */
export const WORD_AUDIO_BUCKET = 'word-audio'
const SIGNED_URL_TTL_SECONDS = 3600

export function WordAudio({ audioPath, label }: { audioPath: string | null; label: string }): React.JSX.Element | null {
  const [loading, setLoading] = useState(false)
  const [gone, setGone] = useState(false)
  const audio = useRef<HTMLAudioElement | null>(null)

  if (!audioPath || gone) return null

  async function play(): Promise<void> {
    if (!audioPath) return
    if (audio.current) {
      audio.current.currentTime = 0
      void audio.current.play()
      return
    }
    setLoading(true)
    try {
      const { data } = await createClient().storage.from(WORD_AUDIO_BUCKET)
        .createSignedUrl(audioPath, SIGNED_URL_TTL_SECONDS)
      if (!data?.signedUrl) {
        setGone(true)
        return
      }
      const element = new Audio(data.signedUrl)
      audio.current = element
      await element.play()
    } catch {
      // A recording that cannot be fetched is treated as one that is not there. Audio is a
      // courtesy on top of the word, never a reason to show the learner an error.
      setGone(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      className="word-audio"
      onClick={() => void play()}
      disabled={loading}
      aria-label={`Hear ${label}`}
      title={`Hear ${label}`}
    >
      {loading ? <Loader2 className="spin" size={14} /> : <Volume2 size={14} />}
    </button>
  )
}
