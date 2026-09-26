'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Volume2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useI18n } from './I18nProvider'

export const WORD_AUDIO_BUCKET = 'word-audio'
const SIGNED_URL_TTL_SECONDS = 3600

export function WordAudio({ audioPath, label, autoPlay = false }: { audioPath: string | null; label: string; autoPlay?: boolean }): React.JSX.Element | null {
  const { t } = useI18n()
  const [loading, setLoading] = useState(false)
  const [recordingUnavailable, setRecordingUnavailable] = useState(false)
  const audio = useRef<HTMLAudioElement | null>(null)
  const autoPlayedKey = useRef<string | null>(null)

  const play = useCallback(async (): Promise<void> => {
    if (!audioPath || recordingUnavailable) return
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
        return
      }
      const element = new Audio(data.signedUrl)
      audio.current = element
      await element.play().catch(() => {})
    } catch {
      setRecordingUnavailable(true)
    } finally {
      setLoading(false)
    }
  }, [audioPath, recordingUnavailable])

  useEffect(() => {
    const key = `${audioPath}:${label}`
    if (!autoPlay || autoPlayedKey.current === key) return
    autoPlayedKey.current = key
    void play()
  }, [audioPath, autoPlay, label, play])

  useEffect(() => () => {
    audio.current?.pause()
  }, [])

  if (!audioPath || recordingUnavailable) return null

  return (
    <button
      type="button"
      className="word-audio"
      onClick={(event) => {
        void play()
        if (event.detail > 0) event.currentTarget.blur()
      }}
      disabled={loading}
      aria-label={t.audio.hear(label)}
      title={t.audio.hear(label)}
    >
      {loading ? <Loader2 className="spin" size={14} /> : <Volume2 size={14} />}
    </button>
  )
}
