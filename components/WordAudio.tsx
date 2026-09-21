'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Volume2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

/**
 * Tap to hear the word (issue #6 §7).
 *
 * This narrowly reverses the AGENTS.md §19 line "do not bring back practice audio". What stays
 * removed is the old three-button Listen / Slower / Say-it-aloud practice mode, which was clutter
 * inside a timed exercise. One button attached to the Danish word is not that.
 *
 * The recording is DDO's, in a private bucket, reached through a short-lived signed URL: Ordly is
 * a single-user app and nothing here is re-published. DDO has no recording for every headword;
 * those few words fall back to the device's Danish voice so the learner still has a useful button.
 */
export const WORD_AUDIO_BUCKET = 'word-audio'
const SIGNED_URL_TTL_SECONDS = 3600

export function WordAudio({ audioPath, label, autoPlay = false }: { audioPath: string | null; label: string; autoPlay?: boolean }): React.JSX.Element | null {
  const [loading, setLoading] = useState(false)
  const [recordingUnavailable, setRecordingUnavailable] = useState(false)
  const audio = useRef<HTMLAudioElement | null>(null)
  const autoPlayedKey = useRef<string | null>(null)

  const speakWithDeviceVoice = useCallback((): void => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(label)
    utterance.lang = 'da-DK'
    window.speechSynthesis.speak(utterance)
  }, [label])

  const play = useCallback(async (): Promise<void> => {
    if (!audioPath || recordingUnavailable) {
      speakWithDeviceVoice()
      return
    }
    if (audio.current) {
      audio.current.currentTime = 0
      await audio.current.play().catch(() => {})
      return
    }
    setLoading(true)
    try {
      const { data } = await createClient().storage.from(WORD_AUDIO_BUCKET)
        .createSignedUrl(audioPath, SIGNED_URL_TTL_SECONDS)
      if (!data?.signedUrl) {
        setRecordingUnavailable(true)
        speakWithDeviceVoice()
        return
      }
      const element = new Audio(data.signedUrl)
      audio.current = element
      await element.play().catch(() => {})
    } catch {
      // A missing object is not a broken review: the device voice keeps the same control useful.
      setRecordingUnavailable(true)
      speakWithDeviceVoice()
    } finally {
      setLoading(false)
    }
  }, [audioPath, recordingUnavailable, speakWithDeviceVoice])

  useEffect(() => {
    const key = `${audioPath || 'device'}:${label}`
    if (!autoPlay || autoPlayedKey.current === key) return
    autoPlayedKey.current = key
    void play()
  }, [audioPath, autoPlay, label, play])

  useEffect(() => () => {
    audio.current?.pause()
  }, [])

  return (
    <button
      type="button"
      className="word-audio"
      onClick={() => void play()}
      onPointerUp={(event) => event.currentTarget.blur()}
      disabled={loading}
      aria-label={`Hear ${label}`}
      title={`Hear ${label}`}
    >
      {loading ? <Loader2 className="spin" size={14} /> : <Volume2 size={14} />}
    </button>
  )
}
