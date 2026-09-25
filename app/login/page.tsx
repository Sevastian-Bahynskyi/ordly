'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, CheckCircle2, Loader2, LockKeyhole, Sparkles } from 'lucide-react'
import { Brand } from '@/components/Brand'
import { useI18n } from '@/components/I18nProvider'
import { createClient } from '@/lib/supabase/client'

const PRODUCTION_SITE_URL = 'https://ordly-sevastian-bahynskyis-projects.vercel.app'

function authRedirectUrl() {
  const base = process.env.NODE_ENV === 'development' ? window.location.origin : PRODUCTION_SITE_URL
  return `${base}/auth/callback`
}

export default function LoginPage() {
  const router = useRouter()
  const { t } = useI18n()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    const supabase = createClient()
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: authRedirectUrl() },
        })
        if (error) throw error
        if (!data.session) {
          setMessage(t.login.reserved)
        } else {
          router.replace('/')
          router.refresh()
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.replace('/')
        router.refresh()
      }
    } catch (error) {
      // Supabase's own error lines are English; the learner reads one in their language instead.
      const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null
      setMessage(code === 'invalid_credentials' ? t.login.invalidCredentials : t.login.couldNotContinue)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-orb orb-one" />
      <div className="auth-orb orb-two" />
      <section className="auth-copy">
        <Brand />
        <div>
          <span className="eyebrow"><Sparkles size={14} /> {t.login.eyebrow}</span>
          <h1>{t.login.titleLine1}<br />{t.login.titleLine2}</h1>
          <p>{t.login.intro}</p>
        </div>
        <div className="auth-benefits">
          {t.login.benefits.map((benefit) => <span key={benefit}><CheckCircle2 size={17} /> {benefit}</span>)}
        </div>
      </section>

      <section className="auth-card">
        <div className="auth-lock"><LockKeyhole size={22} /></div>
        <h2>{mode === 'signin' ? t.login.welcome : t.login.claim}</h2>
        <p>{mode === 'signin' ? t.login.continueStreak : t.login.createToStart}</p>
        <form onSubmit={submit}>
          <label className="field"><span>{t.login.email}</span><input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label>
          <label className="field"><span>{t.login.password}</span><input type="password" minLength={8} required autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t.login.passwordPlaceholder} /></label>
          {message && <div className="notice">{message}</div>}
          <button className="primary-button auth-submit" disabled={loading}>
            {loading ? <Loader2 className="spin" size={17} /> : null}
            {mode === 'signin' ? t.login.signIn : t.login.create}
            {!loading && <ArrowRight size={17} />}
          </button>
        </form>
        <button className="auth-switch" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMessage(null) }}>
          {mode === 'signin' ? t.login.register : t.login.haveAccount}
        </button>
      </section>
    </main>
  )
}
