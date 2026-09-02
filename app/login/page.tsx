'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, CheckCircle2, Loader2, LockKeyhole, Sparkles } from 'lucide-react'
import { Brand } from '@/components/Brand'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
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
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        })
        if (error) throw error
        if (!data.session) {
          setMessage('Account reserved. Confirm the email, then sign in.')
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
      setMessage(error instanceof Error ? error.message : 'Could not continue')
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
          <span className="eyebrow"><Sparkles size={14} /> DANISH THAT STICKS</span>
          <h1>Catch the word.<br />Actually remember it.</h1>
          <p>Fast vocabulary capture, calm daily reviews, and FSRS scheduling underneath.</p>
        </div>
        <div className="auth-benefits">
          <span><CheckCircle2 size={17} /> Add words manually in seconds</span>
          <span><CheckCircle2 size={17} /> AI only when you ask for it</span>
          <span><CheckCircle2 size={17} /> Review exactly when memory needs it</span>
        </div>
      </section>

      <section className="auth-card">
        <div className="auth-lock"><LockKeyhole size={22} /></div>
        <h2>{mode === 'signin' ? 'Welcome back' : 'Claim your account'}</h2>
        <p>{mode === 'signin' ? 'Continue your Danish streak.' : 'Only the first registered account can use this site.'}</p>
        <form onSubmit={submit}>
          <label className="field"><span>Email</span><input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label>
          <label className="field"><span>Password</span><input type="password" minLength={8} required autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" /></label>
          {message && <div className="notice">{message}</div>}
          <button className="primary-button auth-submit" disabled={loading}>
            {loading ? <Loader2 className="spin" size={17} /> : null}
            {mode === 'signin' ? 'Sign in' : 'Create the only account'}
            {!loading && <ArrowRight size={17} />}
          </button>
        </form>
        <button className="auth-switch" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMessage(null) }}>
          {mode === 'signin' ? 'First time here? Register' : 'Already registered? Sign in'}
        </button>
      </section>
    </main>
  )
}
