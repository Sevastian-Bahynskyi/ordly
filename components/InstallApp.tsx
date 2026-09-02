'use client'

import { useEffect, useState } from 'react'
import { Check, Download, MonitorDown, Share2, Smartphone } from 'lucide-react'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type InstallState = 'installed' | 'ios' | 'mac-safari' | 'ready' | 'manual'

export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null)
  const [state, setState] = useState<InstallState>('manual')

  useEffect(() => {
    const nav = navigator as Navigator & { standalone?: boolean }
    const standalone = window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
    const isiOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    const isMacSafari = /Macintosh/i.test(navigator.userAgent) && /Safari/i.test(navigator.userAgent) && !/Chrome|Chromium|Edg/i.test(navigator.userAgent)

    if (standalone) setState('installed')
    else if (isiOS) setState('ios')
    else if (isMacSafari) setState('mac-safari')

    const onPrompt = (event: Event) => {
      event.preventDefault()
      setPrompt(event as InstallPromptEvent)
      setState('ready')
    }
    const onInstalled = () => {
      setPrompt(null)
      setState('installed')
    }

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  async function install() {
    if (!prompt) return
    await prompt.prompt()
    const choice = await prompt.userChoice
    if (choice.outcome === 'accepted') {
      setPrompt(null)
      setState('installed')
    }
  }

  return (
    <section className="install-card">
      <div className="install-heading">
        <div className="install-badge"><Download size={20} /></div>
        <div>
          <span className="eyebrow">ORDLY APP</span>
          <h2>Install Ordly</h2>
          <p>Open it like a normal app, without keeping a browser tab around.</p>
        </div>
      </div>

      {state === 'installed' && (
        <div className="install-status success"><Check size={18} /><div><strong>Installed</strong><span>Ordly is already running as a standalone app on this device.</span></div></div>
      )}

      {state === 'ready' && (
        <button className="primary-button install-button" onClick={install}><MonitorDown size={17} /> Install on this device</button>
      )}

      {state === 'ios' && (
        <div className="install-instructions">
          <div className="install-device"><Smartphone size={18} /><strong>iPhone / iPad</strong></div>
          <ol>
            <li>Open Ordly in Safari.</li>
            <li>Tap <span className="inline-icon"><Share2 size={15} /> Share</span>.</li>
            <li>Choose <strong>Add to Home Screen</strong>, then Add.</li>
          </ol>
        </div>
      )}

      {state === 'mac-safari' && (
        <div className="install-instructions">
          <div className="install-device"><MonitorDown size={18} /><strong>Mac Safari</strong></div>
          <p>Choose <strong>File → Add to Dock</strong>. Ordly will then open in its own standalone window.</p>
        </div>
      )}

      {state === 'manual' && (
        <div className="install-instructions">
          <div className="install-device"><MonitorDown size={18} /><strong>Desktop</strong></div>
          <p>In Chrome or Edge, use the <strong>Install app</strong> button in the address bar or browser menu.</p>
        </div>
      )}
    </section>
  )
}
