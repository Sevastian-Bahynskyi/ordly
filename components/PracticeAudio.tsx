'use client'

import { useEffect, useState, type JSX } from 'react'
import { Volume2 } from 'lucide-react'

export function PracticeAudio({ text, onReplay, disabled = false }: { text: string; onReplay: () => void; disabled?: boolean }): JSX.Element {
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null)
  const [speaking, setSpeaking] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!('speechSynthesis' in window)) return
    function load(): void {
      const voices = window.speechSynthesis.getVoices()
      setVoice(voices.find((item) => item.lang.toLowerCase().replace('_', '-').startsWith('da-')) || voices.find((item) => item.lang === 'da') || null)
    }
    load()
    window.speechSynthesis.addEventListener('voiceschanged', load)
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', load)
      window.speechSynthesis.cancel()
    }
  }, [])
  useEffect(() => {
    setFailed(false)
    setSpeaking(false)
    return () => { if ('speechSynthesis' in window) window.speechSynthesis.cancel() }
  }, [text])
  function play(rate: number): void {
    if (!voice) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.voice = voice
    utterance.lang = 'da-DK'
    utterance.rate = rate
    utterance.onstart = () => setSpeaking(true)
    utterance.onend = () => { setSpeaking(false); onReplay() }
    utterance.onerror = () => { setSpeaking(false); setFailed(true) }
    setFailed(false)
    window.speechSynthesis.speak(utterance)
  }
  return <div className="practice-audio">
    <div className="practice-audio-buttons">
      <button type="button" className="soft-button" disabled={!voice || disabled} onClick={() => play(1)}><Volume2 size={18} />{speaking ? 'Play again' : 'Listen'}</button>
      <button type="button" className="soft-button" disabled={!voice || disabled} onClick={() => play(0.8)}>Slower</button>
    </div>
    {!voice && <small>No Danish voice is available on this device. Use “Show transcript” to continue with reading practice.</small>}
    {failed && <small>Audio could not play. Try again or use the transcript.</small>}
  </div>
}
