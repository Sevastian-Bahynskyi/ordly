'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type JSX, type KeyboardEvent } from 'react'
import { ArrowRight, Check, Flag, Lightbulb, Pause, RotateCcw } from 'lucide-react'
import { diffAnswer } from '@/lib/answer-diff'
import {
  DEFAULT_PRACTICE_MINUTES, isChoiceKind, isPracticeMinutes, isReportable, MAX_PRACTICE_MINUTES, PRACTICE_MINUTE_PRESETS,
  type PracticeKind, type PracticeResponse, type PracticeSessionState, type PracticeTask,
} from '@/lib/practice'
import { isPracticeSession, isRecord } from '@/lib/practice-validation'

type Shortfall = { requestedMinutes: number; availableMinutes: number }
type PracticeView = { revision: number; session: PracticeSessionState | null; retired: boolean; shortfall: Shortfall | null }

const kindLabels: Record<PracticeKind, string> = {
  pick: 'Pick the meaning', choose: 'Fill the gap', assemble: 'Build the sentence',
  cloze: 'Type the missing word', produce: 'Say it in Danish', sense: 'Which meaning is this?',
}

function isView(value: unknown): value is PracticeView {
  if (!isRecord(value) || !Number.isInteger(value.revision) || typeof value.retired !== 'boolean') return false
  if (value.session !== null && !isPracticeSession(value.session)) return false
  const shortfall = value.shortfall
  return shortfall === null || (isRecord(shortfall) && Number.isInteger(shortfall.requestedMinutes) && Number.isInteger(shortfall.availableMinutes))
}

export function PracticeSession(): JSX.Element {
  const [view, setView] = useState<PracticeView | null>(null)
  const [running, setRunning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [answer, setAnswer] = useState('')
  const [picked, setPicked] = useState<number[]>([])
  const busyRef = useRef(false)
  const startedAt = useRef(0)
  const currentView = useRef(view)
  currentView.current = view
  const draftRef = useRef({ answer, picked })
  draftRef.current = { answer, picked }
  const session = view?.session
  const active = session && !session.finished ? session : null
  const task = active?.queue[0]
  const response = active?.current

  const load = useCallback(async (): Promise<void> => {
    setNotice('')
    try {
      const res = await fetch('/api/practice', { cache: 'no-store' })
      const data: unknown = await res.json()
      if (!res.ok || !isView(data)) throw new Error()
      setView(data)
    } catch { setNotice('Practice could not be loaded. Please retry, or open Review.') }
  }, [])
  useEffect(() => { void load() }, [load])

  // A new exercise starts empty unless the saved session holds unsent input for exactly this one.
  const draft = active?.draft
  useEffect(() => {
    const saved = draft && draft.taskId === task?.id ? draft : null
    setAnswer(saved?.answer || '')
    setPicked(saved?.picked || [])
    startedAt.current = performance.now()
    // Only a change of exercise resets the input; a later save of the same draft must not.
  }, [task?.id])

  const send = useCallback(async (action: string, extra: Record<string, unknown> = {}): Promise<boolean> => {
    if (busyRef.current) return false
    busyRef.current = true
    setBusy(true)
    setNotice('')
    const latest = currentView.current
    try {
      const res = await fetch('/api/practice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, revision: latest?.revision, taskId: latest?.session?.queue[0]?.id || '', ...extra }) })
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

  const pauseDraft = useCallback((): Record<string, unknown> => {
    const { answer: typed, picked: tiles } = draftRef.current
    return { draft: typed || tiles.length ? { answer: typed, picked: tiles } : null }
  }, [])

  // Leaving the app pauses the session with whatever was typed. There is deliberately no timed
  // autosave and no deadline: a timer that disabled the field mid-answer was removed before.
  useEffect(() => {
    if (!running || !task) return
    function hide(): void {
      if (document.visibilityState === 'hidden') {
        setRunning(false)
        void send('pause', pauseDraft())
      }
    }
    document.addEventListener('visibilitychange', hide)
    return () => document.removeEventListener('visibilitychange', hide)
  }, [running, task, send, pauseDraft])

  async function start(minutes: number, acceptShorter = false): Promise<void> {
    if (!await send('start', { minutes, acceptShorter })) return
    if (currentView.current?.session?.queue.length && !currentView.current.shortfall) setRunning(true)
  }
  async function resume(): Promise<void> {
    if (await send('resume')) setRunning(true)
  }
  async function pause(): Promise<void> {
    if (await send('pause', pauseDraft())) setRunning(false)
  }
  async function finish(): Promise<void> {
    if (await send('finish')) setRunning(false)
  }
  const error = notice && <div className="practice-notice" role="alert">{notice}<button className="soft-button" disabled={busy} onClick={() => { setRunning(false); void load() }}>Reload saved session</button></div>

  if (!view) return <section className="section-card practice-welcome"><span className="eyebrow">PRACTICE</span><h1>{notice ? 'Let’s reconnect.' : 'Preparing your practice…'}</h1>{error}<Link className="practice-review-link" href="/review">Open Review →</Link></section>

  if (!active) return <>
    {error}
    <PracticeStart busy={busy} shortfall={view.shortfall} retired={view.retired} finished={session?.finished ? session : null} onStart={(minutes, shorter) => void start(minutes, shorter)} />
  </>

  const done = active.completed
  const total = done + active.queue.length
  const controls = <div className="practice-session-controls">
    {running && task && <button className="soft-button" disabled={busy} onClick={() => void pause()}><Pause size={16} />Pause</button>}
    <button className="soft-button" disabled={busy} onClick={() => void finish()}><Check size={16} />Finish</button>
  </div>
  // With nothing left to answer the card's own Finish is the one action, so the header has none.
  const header = <header className="practice-header practice-header-active"><span className="eyebrow">PRACTICE · {active.targetMinutes} MIN GOAL</span>{task && controls}</header>

  if (!task) return <>
    {header}
    {error}
    <section className="section-card practice-welcome">
      <span className="eyebrow">{active.completed ? 'GOAL REACHED' : 'NOTHING LEFT TO PRACTISE'}</span>
      <h2>{active.completed ? 'Nicely done.' : 'This session is out of exercises.'}</h2>
      <SessionSummary session={active} />
      <button className="primary-button practice-start" disabled={busy} onClick={() => void finish()}>Finish session<ArrowRight size={18} /></button>
    </section>
  </>

  if (!running) return <>
    {header}
    {error}
    <section className="section-card practice-welcome">
      <span className="eyebrow">YOUR PLACE IS SAVED</span>
      <h2>Pick up where you left off.</h2>
      <p>{done ? `${done} ${done === 1 ? 'exercise' : 'exercises'} done. ` : ''}The same exercise is waiting{active.draft?.taskId === task.id ? ', with your answer so far' : ''}.</p>
      <button className="primary-button practice-start" disabled={busy} onClick={() => void resume()}>Resume practice<ArrowRight size={18} /></button>
    </section>
  </>

  const choiceKind = isChoiceKind(task.kind)
  const tiles = task.choices || []
  const revealed = response?.revealed
  const hinted = response?.assistance === 'hint'
  const promptIsDanish = !['produce', 'assemble'].includes(task.kind)
  const submit = (value = answer): void => { if (!busy) void send('answer', { answer: value, responseMs: Math.max(0, performance.now() - startedAt.current) }) }
  const enterSubmits = (event: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit()
    }
  }
  return <>
    {header}
    <div className="practice-progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Session progress"><span style={{ width: `${total ? Math.round(done / total * 100) : 0}%` }} /></div>
    {error}
    <section className="flash-card practice-card" key={task.id}>
      <div className="card-topline"><span className="prompt-type">{kindLabels[task.kind]}</span><span className="practice-step">{Math.min(done + 1, total)} / {total}</span>{task.retry > 0 && <span className="status-chip learning"><RotateCcw size={12} />Again</span>}</div>
      {task.kind === 'sense' && <p className="practice-sense-lead">Two sentences, one word — <strong lang="da">{task.danish}</strong> — two different meanings. Which meaning does the first sentence use?</p>}
      <div className="practice-prompt">
        <h2 lang={promptIsDanish ? 'da' : undefined}>{task.prompt}</h2>
        {task.kind === 'cloze' && (task.context || task.translation) && <p className="practice-context">{task.context || task.translation}</p>}
        {task.kind === 'produce' && task.answerIsSentence && <p className="practice-context">Write the whole sentence in Danish.</p>}
      </div>
      {task.kind === 'sense' && task.contrast && <div className="practice-contrast"><span>The other meaning appears here</span><p lang="da">{task.contrast}</p></div>}
      {!revealed && <form className="answer-form" onSubmit={(event) => { event.preventDefault(); submit() }}>
        {choiceKind ? (task.kind === 'assemble'
          ? <WordBank tiles={tiles} picked={picked} disabled={busy} onChange={(next) => { setPicked(next); setAnswer(next.map((index) => tiles[index]).join(' ')) }} />
          : <ChoiceList task={task} tiles={tiles} chosen={answer} disabled={busy} onChoose={setAnswer} />)
          : task.kind === 'cloze'
            ? <><label htmlFor="practice-answer">The missing word</label><input id="practice-answer" className="practice-cloze-input" value={answer} onChange={(event) => setAnswer(event.target.value)} onKeyDown={enterSubmits} readOnly={busy} maxLength={200} placeholder="Type the word…" autoFocus autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} lang="da" /></>
            : <><label htmlFor="practice-answer">Your Danish answer</label><textarea id="practice-answer" value={answer} onChange={(event) => setAnswer(event.target.value)} onKeyDown={enterSubmits} readOnly={busy} maxLength={2000} rows={2} placeholder="Type it in Danish…" autoFocus autoCapitalize="sentences" autoCorrect="off" spellCheck={false} lang="da" /></>}
        <button className="primary-button answer-submit" disabled={busy || (choiceKind && !answer.trim())}>{busy ? 'Checking…' : !choiceKind && !answer.trim() ? 'I don’t know' : 'Check'}<ArrowRight size={17} /></button>
        {choiceKind
          ? <button className="practice-text-button" type="button" disabled={busy} onClick={() => submit('')}>I don’t know</button>
          : !hinted && <button className="practice-text-button" type="button" disabled={busy} onClick={() => void send('help')}><Lightbulb size={15} />Show a hint</button>}
        {hinted && <div className="practice-hint">{task.hint}</div>}
      </form>}
      {revealed && response && <div className="practice-feedback" aria-live="polite">
        <span className={`practice-verdict ${response.result}`}>{verdict(response)}</span>
        <p>{response.feedback}</p>
        <FeedbackAnswers task={task} response={response} />
        {response.reported
          ? <p className="practice-reported" role="status"><Flag size={14} />Sent for review. Nothing else changed.</p>
          : isReportable(task, response) && <button className="practice-text-button" type="button" disabled={busy} onClick={() => void send('report')}><Flag size={15} />My answer is also correct</button>}
        <button className="primary-button practice-continue" disabled={busy} onClick={() => void send('next')} autoFocus>Continue<ArrowRight size={17} /></button>
      </div>}
    </section>
    <p className="practice-footnote">Practice never changes your Review schedule.</p>
  </>
}

/** The duration picker, shown at every start. It never starts on its own. */
function PracticeStart({ busy, shortfall, retired, finished, onStart }: { busy: boolean; shortfall: Shortfall | null; retired: boolean; finished: PracticeSessionState | null; onStart: (minutes: number, acceptShorter: boolean) => void }): JSX.Element {
  const [preset, setPreset] = useState<number | 'custom'>(DEFAULT_PRACTICE_MINUTES)
  const [custom, setCustom] = useState('15')
  const minutes = preset === 'custom' ? Number(custom) : preset
  const valid = isPracticeMinutes(minutes)
  const empty = shortfall?.availableMinutes === 0

  return <section className="section-card practice-welcome">
    <span className="eyebrow">{finished ? 'SESSION DONE' : 'PRACTICE'}</span>
    <h1>{finished ? 'Practice again?' : 'Practise your saved words.'}</h1>
    {finished ? <SessionSummary session={finished} /> : <p>Short exercises from your Material. Practice never changes your Review schedule.</p>}
    {retired && <p className="practice-quiet-note">Practice was updated, so your earlier session was closed. Your Review progress is unchanged.</p>}
    {empty
      ? <div className="practice-shortfall" role="status"><p>There isn’t enough saved Material with meanings to build Practice yet. Save a few words, or review what you have.</p><Link className="primary-button practice-start" href="/review">Open Review<ArrowRight size={18} /></Link></div>
      : shortfall
        ? <div className="practice-shortfall" role="status">
            <p>Your saved Material fills about {shortfall.availableMinutes} {shortfall.availableMinutes === 1 ? 'minute' : 'minutes'} of Practice, not {shortfall.requestedMinutes}.</p>
            <button className="primary-button practice-start" disabled={busy} onClick={() => onStart(shortfall.requestedMinutes, true)}>Start {shortfall.availableMinutes}-minute session<ArrowRight size={18} /></button>
          </div>
        : <>
            <fieldset className="practice-duration" disabled={busy}>
              <legend className="eyebrow">HOW LONG?</legend>
              <div className="practice-duration-options" role="radiogroup" aria-label="Practice length">
                {PRACTICE_MINUTE_PRESETS.map((value) => <button key={value} type="button" role="radio" aria-checked={preset === value} className={`practice-duration-option ${preset === value ? 'chosen' : ''}`} onClick={() => setPreset(value)}>{value} min</button>)}
                <button type="button" role="radio" aria-checked={preset === 'custom'} className={`practice-duration-option ${preset === 'custom' ? 'chosen' : ''}`} onClick={() => setPreset('custom')}>Custom</button>
              </div>
              {preset === 'custom' && <label className="practice-duration-custom">
                <input type="number" inputMode="numeric" min={1} max={MAX_PRACTICE_MINUTES} step={1} value={custom} onChange={(event) => setCustom(event.target.value)} aria-describedby="practice-duration-help" />
                <span>minutes</span>
                <small id="practice-duration-help">{valid ? `Up to ${MAX_PRACTICE_MINUTES}.` : `Choose 1 to ${MAX_PRACTICE_MINUTES} whole minutes.`}</small>
              </label>}
            </fieldset>
            <button className="primary-button practice-start" disabled={busy || !valid} onClick={() => onStart(minutes, false)}>{busy ? 'Preparing…' : 'Start practice'}<ArrowRight size={18} /></button>
          </>}
    {!empty && <Link className="practice-review-link" href="/review">Review instead →</Link>}
  </section>
}

function SessionSummary({ session }: { session: PracticeSessionState }): JSX.Element {
  const attempts = session.attempts
  const right = attempts.filter((attempt) => attempt.result === 'correct' || attempt.result === 'mostly').length
  const minutes = Math.max(1, Math.round(session.elapsedSeconds / 60))
  return <p>{attempts.length} {attempts.length === 1 ? 'exercise' : 'exercises'} in about {minutes} {minutes === 1 ? 'minute' : 'minutes'}{attempts.length ? `, ${right} right` : ''}.</p>
}

function verdict(response: PracticeResponse): string {
  switch (response.result) {
    case 'correct': return 'Correct'
    case 'mostly': return 'Close'
    case 'unverified': return 'Compare with your saved sentence'
    case 'dont_know': return 'Here’s the answer'
    default: return 'Not quite'
  }
}

/**
 * What the learner answered next to what was expected. A typed Danish answer that was not fully
 * right is diffed: what they got wrong is red in their answer, what they missed is green.
 */
function FeedbackAnswers({ task, response }: { task: PracticeTask; response: PracticeResponse }): JSX.Element {
  const typed = response.answer.trim()
  // An unverified answer may be right, so it is shown beside the saved one rather than marked up.
  const comparable = typed && response.result !== 'correct' && response.result !== 'unverified' && ['produce', 'cloze', 'assemble'].includes(task.kind)
  const diff = comparable ? diffAnswer(typed, task.answer) : null
  const label = task.kind === 'sense' || task.kind === 'pick' ? 'The meaning' : 'Answer'
  const answerIsDanish = !['sense', 'pick'].includes(task.kind)

  if (diff && !diff.identical) {
    return <div className="practice-diff">
      <div><small>Your answer</small><p lang="da">{diff.actual.map((part, index) => part.changed ? <mark key={index} className="diff-wrong">{part.text}</mark> : <span key={index}>{part.text}</span>)}</p></div>
      <div><small>{label}</small><p lang="da">{diff.expected.map((part, index) => part.changed ? <mark key={index} className="diff-fixed">{part.text}</mark> : <span key={index}>{part.text}</span>)}</p></div>
    </div>
  }
  const wrongTap = response.assistance === 'choices' && response.result === 'incorrect' && typed
  if (response.result === 'unverified') {
    return <div className="practice-diff">
      <div><small>Your sentence</small><p lang="da">{typed}</p></div>
      <div><small>Saved sentence</small><p lang="da">{task.answer}</p></div>
    </div>
  }
  return <>
    <div className="correct-answer"><span>{label}</span><strong lang={answerIsDanish ? 'da' : undefined}>{task.answer}</strong></div>
    {wrongTap && <p className="practice-your-answer"><small>Your answer</small><mark className="diff-wrong">{typed}</mark></p>}
  </>
}

/**
 * The word bank. Tiles move between the bank and the built line; tapping a placed tile takes it
 * back. Indices rather than texts are tracked, so a sentence that repeats a word still works.
 */
function WordBank({ tiles, picked, disabled, onChange }: { tiles: string[]; picked: number[]; disabled: boolean; onChange: (next: number[]) => void }): JSX.Element {
  const remaining = tiles.map((_, index) => index).filter((index) => !picked.includes(index))
  return <div className="practice-bank">
    <div className="practice-bank-line" aria-live="polite" aria-label="Your sentence">
      {picked.length
        ? picked.map((index, position) => <button key={`${index}-${position}`} type="button" className="practice-tile placed" disabled={disabled} onClick={() => onChange(picked.filter((_, at) => at !== position))} lang="da">{tiles[index]}</button>)
        : <span className="practice-bank-empty">Tap the words in order.</span>}
    </div>
    <div className="practice-bank-tiles">
      {remaining.map((index) => <button key={index} type="button" className="practice-tile" disabled={disabled} onClick={() => onChange([...picked, index])} lang="da">{tiles[index]}</button>)}
      {!remaining.length && <span className="practice-bank-empty">Every tile is placed.</span>}
    </div>
    {picked.length > 0 && <button type="button" className="practice-text-button" disabled={disabled} onClick={() => onChange([])}>Clear</button>}
  </div>
}

/** The options for a gap, a meaning or a sense. One stays selected until submitted. */
function ChoiceList({ task, tiles, chosen, disabled, onChoose }: { task: PracticeTask; tiles: string[]; chosen: string; disabled: boolean; onChoose: (value: string) => void }): JSX.Element {
  const danish = task.kind === 'choose'
  return <div className="practice-choices" role="radiogroup" aria-label={danish ? 'Words for the gap' : 'Possible meanings'}>
    {tiles.map((choice, index) => <button key={`${choice}-${index}`} type="button" role="radio" aria-checked={chosen === choice} className={`practice-choice ${chosen === choice ? 'chosen' : ''}`} disabled={disabled} onClick={() => onChoose(choice)} lang={danish ? 'da' : undefined}>{choice}</button>)}
  </div>
}
