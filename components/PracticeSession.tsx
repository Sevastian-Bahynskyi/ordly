'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { ArrowRight, Check, Lightbulb, MessageCircle, Pause, RotateCcw, Sparkles } from 'lucide-react'
import { PracticeAudio } from './PracticeAudio'
import type { PracticeSessionState, PracticeSummary } from '@/lib/practice'
import { isPracticeStore, isRecord } from '@/lib/practice-validation'

type PracticeView = { revision: number; session: PracticeSessionState | null; summary: PracticeSummary }
const stages = [{ id: 'remember', label: 'Remember' }, { id: 'learn', label: 'Repair & learn' }, { id: 'build', label: 'Build' }, { id: 'speak', label: 'Use it' }, { id: 'return', label: 'Return' }]
const ratings = [{ value: 1, label: 'Again', detail: 'Forgot or needed help', cls: 'again' }, { value: 2, label: 'Hard', detail: 'Recalled with effort', cls: 'hard' }, { value: 3, label: 'Good', detail: 'Recalled on my own', cls: 'good' }, { value: 4, label: 'Easy', detail: 'Immediate recall', cls: 'easy' }]

function isView(value: unknown): value is PracticeView {
  return isRecord(value) && isPracticeStore({ ...value, objectives: {} }) && isRecord(value.summary)
    && ['meaning', 'production', 'listening'].every((key) => isRecord(value.summary) && isRecord(value.summary[key]) && Number.isFinite(value.summary[key].total) && Number.isFinite(value.summary[key].correct))
}

export function PracticeSession(): JSX.Element {
  const [view, setView] = useState<PracticeView | null>(null)
  const [running, setRunning] = useState(false)
  const [aiEnabled, setAiEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [answer, setAnswer] = useState('')
  const [replays, setReplays] = useState(0)
  const [modality, setModality] = useState<'typed' | 'spoken'>('typed')
  const busyRef = useRef(false)
  const startedAt = useRef(0)
  const currentView = useRef(view)
  currentView.current = view
  const session = view?.session
  const task = session?.queue[0]
  const response = session?.current

  const load = useCallback(async (): Promise<void> => {
    setNotice('')
    try {
      const res = await fetch('/api/practice', { cache: 'no-store' })
      const data: unknown = await res.json()
      if (!res.ok || !isView(data)) throw new Error()
      setView(data)
    } catch { setNotice('Practice could not be loaded. Please retry, or open ordinary review.') }
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    setAnswer('')
    setReplays(0)
    setModality('typed')
    startedAt.current = performance.now()
  }, [task?.id])

  const send = useCallback(async (action: string, extra: Record<string, unknown> = {}): Promise<boolean> => {
    if (busyRef.current) return false
    busyRef.current = true
    setBusy(true)
    setNotice('')
    const latest = currentView.current
    try {
      const res = await fetch('/api/practice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, revision: latest?.revision, taskId: latest?.session?.queue[0]?.id || '', elapsedSeconds: latest?.session?.elapsedSeconds || 0, responseMs: Math.min(3600000, Math.max(0, performance.now() - startedAt.current)), replays: 0, ...extra }) })
      const data: unknown = await res.json()
      if (!res.ok || !isView(data)) {
        setNotice(res.status === 409 ? 'This session changed on another screen. Reload the saved session to continue.' : 'Could not save this step. Retry to continue; your saved progress is safe.')
        return false
      }
      currentView.current = data
      setView(data)
      return true
    } catch {
      setNotice('Connection interrupted. Reconnect and retry this step.')
      return false
    } finally { busyRef.current = false; setBusy(false) }
  }, [])

  useEffect(() => {
    if (!running || !task) return
    const save = window.setInterval(() => { void send('pause') }, 15000)
    function hide(): void {
      if (document.visibilityState === 'hidden') {
        setRunning(false)
        if ('speechSynthesis' in window) window.speechSynthesis.cancel()
        void send('pause')
      }
    }
    document.addEventListener('visibilitychange', hide)
    return () => { window.clearInterval(save); document.removeEventListener('visibilitychange', hide) }
  }, [running, task?.id, send])

  async function start(): Promise<void> {
    if (!session?.queue.length) {
      if (!await send('start', { aiEnabled })) return
      if (!currentView.current?.session?.queue.length) {
        setNotice('No more exercises are available right now. You can finish and see your results.')
        return
      }
    }
    startedAt.current = performance.now()
    setRunning(true)
  }
  async function pause(): Promise<void> {
    if (await send('pause')) setRunning(false)
  }
  async function finish(): Promise<void> {
    if (await send('finish')) setRunning(false)
  }
  const error = notice && <div className="practice-notice" role="alert">{notice}<button className="soft-button" disabled={busy} onClick={() => { setRunning(false); void load() }}>Reload saved session</button></div>

  if (!view) return <section className="section-card practice-welcome"><span className="eyebrow">DAILY PRACTICE</span><h1>{notice ? 'Let’s reconnect.' : 'Preparing your practice…'}</h1>{error}<Link href="/review">Open ordinary review →</Link></section>

  if (!running || !task) return <>
    <header className="practice-header"><div><span className="eyebrow">USEFUL DANISH · AT YOUR PACE</span><h1>{session?.finished ? 'A little more Danish, ready to use.' : 'Make it easier to remember.'}</h1><p>Suggested: 15–20 minutes. Stay longer or finish whenever you feel done.</p></div></header>
    {error}
    <section className="section-card practice-welcome">
      <div className="practice-mark"><MessageCircle size={30} /></div>
      <span className="eyebrow">{session?.finished ? 'SESSION RESULTS' : session ? 'YOUR PLACE IS SAVED' : 'GUIDED PRACTICE'}</span>
      <h2>{session?.finished ? `${session.completed} practice steps finished.` : task ? 'Pick up where you left off.' : session ? 'Ready for more?' : 'Move from knowing a word to using it.'}</h2>
      <p>{session?.finished ? 'Your rated answers are saved. Unfinished exercises were not marked as completed.' : task ? `${task.retry ? 'A retry is waiting. ' : ''}${session.queue.length} steps in this batch. Pause to return later, or finish to see your results.` : session ? 'This batch is complete. Load more practice, pause, or finish your session.' : 'Recall words, build sentences, and practise short exchanges. Difficult items come back after a little space.'}</p>
      {session?.finished && <div className="practice-evidence-grid">
        <div><span>Targets practised</span><strong>{new Set(session.attempts.map((attempt) => attempt.targetKey)).size}</strong></div>
        <div><span>Unaided recalls</span><strong>{session.attempts.filter((attempt) => attempt.assistance === 'none' && attempt.modality === 'typed' && attempt.rating !== 1 && ['correct', 'mostly'].includes(attempt.result)).length}</strong></div>
        <div><span>Retry ratings</span><strong>{session.attempts.filter((attempt) => attempt.rating === 1).length}</strong></div>
      </div>}
      {!session && <div className="practice-outline">{stages.map((stage) => <div key={stage.id}>{stage.label}</div>)}</div>}
      {(!session || session.finished) && <label className="practice-ai-option"><input type="checkbox" checked={aiEnabled} onChange={(e) => setAiEnabled(e.target.checked)} /><span><strong>Use AI feedback</strong><small>Send exercise text and typed answers to our AI provider when checking needs more than an exact match.</small></span></label>}
      <button className="primary-button practice-start" disabled={busy} onClick={() => void start()}>{busy ? 'Preparing…' : task ? 'Resume practice' : session && !session.finished ? 'Keep practising' : 'Start practice'}<ArrowRight size={18} /></button>
      {session && !session.finished && <div className="practice-session-actions">{running && <button className="soft-button" disabled={busy} onClick={() => void pause()}><Pause size={16} />Pause</button>}<button className="soft-button" disabled={busy} onClick={() => void finish()}><Check size={16} />Finish session</button></div>}
      <Link className="practice-review-link" href="/review">Ordinary FSRS review →</Link>
    </section>
    <PracticeProgress summary={view.summary} />
    <p className="practice-footnote">Practice is saved to your account. Speaking is self-checked; device audio is a guide. These observations measure recall, not a CEFR level.</p>
  </>

  const teaching = task.kind === 'teach'
  const listening = task.kind === 'listen'
  const help = response?.assistance && response.assistance !== 'none'
  const revealed = response?.revealed
  const suggested = response?.assistance !== 'none' || response?.result === 'incorrect' ? 1 : response?.result === 'mostly' ? 2 : 3
  const phase = stages.find((stage) => stage.id === task.stage)
  return <>
    <header className="practice-header practice-header-active"><div><span className="eyebrow">DAILY PRACTICE</span><h1>{phase?.label}</h1></div><div className="practice-session-controls"><button className="soft-button" disabled={busy} onClick={() => void pause()}><Pause size={16} />Pause</button><button className="soft-button" disabled={busy} onClick={() => void finish()}><Check size={16} />Finish session</button></div></header>
    <nav className="practice-stages" aria-label="Practice stages">{stages.map((stage) => <span key={stage.id} className={stage.id === task.stage ? 'active' : ''} aria-current={stage.id === task.stage ? 'step' : undefined}>{stage.label}</span>)}</nav>
    {error}
    <section className="flash-card practice-card" key={task.id}>
      <div className="card-topline"><span className="prompt-type">{teaching ? 'Connect sound, meaning & situation' : task.kind === 'recall' ? 'Danish → meaning' : task.kind === 'produce' ? 'Meaning → Danish' : task.kind === 'build' ? 'Change the sentence' : listening ? 'Listen, then respond' : 'Keep the exchange going'}</span>{task.retry > 0 && <span className="status-chip learning"><RotateCcw size={12} />Retry</span>}</div>
      <div className="practice-prompt"><h2>{task.prompt}</h2>{teaching && <><strong lang="da">{task.danish}</strong><p>{task.translation}</p><p className="practice-explanation">{task.hint}</p>{task.example !== task.danish && <p lang="da">{task.example}</p>}</>}</div>
      {(task.audioText || teaching) && <PracticeAudio text={task.audioText || task.danish} disabled={busy} onReplay={() => setReplays((count) => Math.min(100, count + 1))} />}
      {listening && !revealed && <button className="practice-text-button" disabled={busy} onClick={() => void send('help', { help: 'transcript', replays })}>Show transcript</button>}
      {listening && (response?.assistance === 'transcript' || revealed) && <p className="practice-transcript" lang="da">{task.audioText}</p>}
      {teaching ? <div className="practice-teach-action"><p>Picture one real situation where you would say this. Say it once, then recall it with the answer hidden.</p><button className="primary-button" disabled={busy} onClick={() => void send('rate', { rating: null, replays })}>Hide it & keep practising<ArrowRight size={17} /></button></div> : <>
        {!revealed && <form className="answer-form" onSubmit={(event) => { event.preventDefault(); void send('answer', { answer, modality, replays }) }}>
          {task.kind !== 'recall' && <div className="practice-modality" aria-label="Answer method"><button type="button" className={modality === 'typed' ? 'active' : ''} onClick={() => setModality('typed')}>Type it</button><button type="button" className={modality === 'spoken' ? 'active' : ''} onClick={() => setModality('spoken')}>Say it aloud</button></div>}
          {modality === 'typed' ? <><label htmlFor="practice-answer">{task.kind === 'recall' ? 'What does it mean?' : 'Your Danish answer'}</label><textarea id="practice-answer" value={answer} onChange={(event) => setAnswer(event.target.value)} disabled={busy} maxLength={2000} rows={2} placeholder={task.kind === 'recall' ? 'Recall the meaning…' : 'Form your own answer…'} autoCapitalize="sentences" autoCorrect="off" spellCheck={false} /></> : <p className="practice-spoken-prompt">Say your answer before revealing the example. Your microphone is not recorded.</p>}
          <button className="primary-button answer-submit" disabled={busy || (listening && !replays && response?.assistance !== 'transcript')}>{busy ? 'Saving & checking…' : modality === 'spoken' ? 'I said it — compare' : answer.trim() ? 'Check answer' : 'I don’t know — show me'}<ArrowRight size={17} /></button>
          {!listening && <button className="practice-text-button" type="button" disabled={busy} onClick={() => void send('help', { help: 'hint', replays })}><Lightbulb size={15} />Help me remember</button>}
          {help && <div className="practice-hint">{task.hint}<small>This is supported practice. You’ll try again with the answer hidden.</small></div>}
        </form>}
        {revealed && response && <div className="practice-feedback" aria-live="polite">
          <span className={`practice-verdict ${response.result}`}>{response.result === 'correct' ? 'Meaning recalled' : response.result === 'mostly' ? 'Close — one adjustment' : response.result === 'incorrect' ? 'Let’s repair this' : 'Compare & self-check'}</span>
          <p>{response.feedback}</p>
          {task.objective === 'production' && response.communication === 'yes' && response.target === 'no' && <p>Your reply works, but it did not retrieve this target expression. We’ll practise the target again.</p>}
          <div className="correct-answer"><span>{['listen', 'dialogue'].includes(task.kind) ? 'One possible reply' : 'Answer to recall'}</span><strong lang={task.kind === 'recall' ? undefined : 'da'}>{task.answer}</strong></div>
          {response.answer && <p className="practice-your-answer"><small>Your answer</small>{response.answer}</p>}
          {task.kind !== 'recall' && <PracticeAudio text={task.answer} onReplay={() => {}} />}
          {(response.result === 'incorrect' || help || task.source === 'ai') && <div className="practice-repair"><Lightbulb size={18} /><div><strong>Give it a useful connection</strong><p>{task.hint}</p>{task.example !== task.danish && task.example.trim() !== task.hint.trim() && <p className="practice-example">{task.example}</p>}<p>Think of a moment you would use it. Then try again after another exercise.</p></div></div>}
          {session.aiEnabled && session.aiCalls < 12 && <button className="practice-text-button" disabled={busy} onClick={() => void send('repair')}><Sparkles size={15} />Create two AI memory examples</button>}
          <div className="rating-title"><span>How did recall feel?</span><small>{help ? 'Helped answers return for an unaided retry.' : task.objective ? 'You decide the FSRS rating.' : 'Rate this practice; your word schedules stay separate.'}</small></div>
          <div className="rating-grid practice-rating-grid">{ratings.map((rating) => <button key={rating.value} className={`rating-button ${rating.cls} ${suggested === rating.value ? 'suggested' : ''}`} disabled={busy} onClick={() => void send('rate', { rating: rating.value, replays })}><strong>{rating.label}</strong><span>{rating.detail}</span></button>)}</div>
        </div>}
      </>}
    </section>
    <div className="practice-bottom-note"><Sparkles size={15} /><span>{task.objective === 'production' && !task.cardId ? 'Danish production has its own FSRS schedule.' : task.cardId ? 'Uses your existing review schedule; its older history includes mixed exercises.' : 'Practising one useful pattern, a little at a time.'}</span></div>
  </>
}

function PracticeProgress({ summary }: { summary: PracticeSummary }): JSX.Element {
  return <section className="section-card practice-evidence"><div><span className="eyebrow">WHAT STAYS WITH YOU</span><h2>Recall after a day away</h2><p>Unaided, typed answers after at least 24 hours without a recorded exposure. Early practice and self-checks are excluded.</p></div><div className="practice-evidence-grid">{[{ key: 'meaning', label: 'Meaning' }, { key: 'production', label: 'Danish production' }, { key: 'listening', label: 'Listening response' }].map(({ key, label }) => {
    const score = summary[key as 'meaning' | 'production' | 'listening']
    return <div key={key}><span>{label}</span><strong>{score.total ? `${score.correct} / ${score.total}` : '—'}</strong><small>{score.total ? 'successful delayed attempts' : 'Building the first observations'}</small></div>
  })}</div></section>
}
