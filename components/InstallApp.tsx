'use client'

import { useEffect, useState } from 'react'
import { Check, Download, MonitorDown, Share2, Smartphone } from 'lucide-react'
import { useI18n } from './I18nProvider'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type InstallState = 'installed' | 'ios' | 'mac-safari' | 'ready' | 'manual'

export function InstallApp(): React.JSX.Element {
  const { t } = useI18n()
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
          <span className="eyebrow">{t.install.eyebrow}</span>
          <h2>{t.install.title}</h2>
          <p>{t.install.intro}</p>
        </div>
      </div>

      {state === 'installed' && (
        <div className="install-status success"><Check size={18} /><div><strong>{t.install.installed}</strong><span>{t.install.installedHelp}</span></div></div>
      )}

      {state === 'ready' && (
        <button className="primary-button install-button" onClick={install}><MonitorDown size={17} /> {t.install.installHere}</button>
      )}

      {state === 'ios' && (
        <div className="install-instructions">
          <div className="install-device"><Smartphone size={18} /><strong>iPhone / iPad</strong></div>
          <ol>
            <li>{t.install.openSafari}</li>
            <li>{t.install.tap} <span className="inline-icon"><Share2 size={15} /> {t.install.share}</span>.</li>
            <li>{t.install.choose} <strong>{t.install.addToHome}</strong>{t.install.thenAdd}</li>
          </ol>
        </div>
      )}

      {state === 'mac-safari' && (
        <div className="install-instructions">
          <div className="install-device"><MonitorDown size={18} /><strong>Mac Safari</strong></div>
          <p>{t.install.macChoose} <strong>{t.install.addToDock}</strong>{t.install.macThen}</p>
        </div>
      )}

      {state === 'manual' && (
        <div className="install-instructions">
          <div className="install-device"><MonitorDown size={18} /><strong>{t.install.desktop}</strong></div>
          <p>{t.install.desktopUse} <strong>{t.install.installApp}</strong> {t.install.desktopThen}</p>
        </div>
      )}
    </section>
  )
}
