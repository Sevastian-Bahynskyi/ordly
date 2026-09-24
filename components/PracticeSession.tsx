'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type JSX, type KeyboardEvent } from 'react'
import { ArrowRight, Check, Eye, Flag, Lightbulb, MessageCircle, Pause, RotateCcw, X } from 'lucide-react'
import { diffAnswer } from '@/lib/answer-diff'
import {
  DEFAULT_PRACTICE_MINUTES, isChoiceKind, isPracticeMinutes, isReportable, MAX_PRACTICE_MINUTES, PRACTICE_MINUTE_PRESETS, TYPED_KINDS,
  type PracticeResponse, type PracticeSessionState, type PracticeTask,
} from '@/lib/practice'
import { parsePlacement } from '@/lib/practice-grading'
import { isFeedbackCode, PRACTICE_COPY, practiceLocale, type PracticeCopy } from '@/lib/practice-i18n'
import { isPracticeSession, isRecord } from '@/lib/practice-validation'
import type { TranslationLanguage } from '@/lib/types'

type Shortfall = { requestedMinutes: number; availableMinutes: number }
type PracticeView = { revision: number; session: PracticeSessionState | null; retired: boolean; shortfall: Shortfall | null }

function isView(value: unknown): value is PracticeView {
  if (!isRecord(value) || !Number.isInteger(value.revision) || typeof value.retired !== 'boolean') return false
  if (value.session !== null && !isPracticeSession(value.session)) return false
  const shortfall = value.shortfall
  return shortfall === null || (isRecord(shortfall) && Number.isInteger(shortfall.requestedMinutes) && Number.isInteger(shortfall.availableMinutes))
}

/** A flash card that has been revealed but not yet rated keeps that state across a pause. */
const REVEALED = 'revealed'

export function PracticeSession({ learnerLanguage }: { learnerLanguage: TranslationLanguage }): JSX.Element {
  const [view, setView] = useState<PracticeView | null>(null)
  const [running, setRunning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<keyof PracticeCopy | ''>('')
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
  // The session's own language once it exists, so a mid-session settings change cannot mix two.
  const t = PRACTICE_COPY[practiceLocale(active?.locale || learnerLanguage)]

  const load = useCallback(async (): Promise<void> => {
    setNotice('')
    try {
      const res = await fetch('/api/practice', { cache: 'no-store' })
      const data: unknown = await res.json()
      if (!res.ok || !isView(data)) throw new Error()
      setView(data)
    } catch { setNotice('loadFailed') }
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
        setNotice(res.status === 409 ? 'conflict' : 'saveFailed')
        return false
      }
      currentView.current = data
      setView(data)
      return true
    } catch {
      setNotice('offline')
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
  const message = notice ? t[notice] : ''
  const error = notice && <div className="practice-notice" role="alert">{typeof message === 'string' ? message : ''}<button className="soft-button" disabled={busy} onClick={() => { setRunning(false); void load() }}>{t.reload}</button></div>

  if (!view) return <section className="section-card practice-welcome"><span className="eyebrow">{t.eyebrow}</span><h1>{notice ? t.reconnect : t.preparing}</h1>{error}<Link className="practice-review-link" href="/review">{t.openReview} →</Link></section>

  if (!active) return <>
    {error}
    <PracticeStart t={t} busy={busy} shortfall={view.shortfall} retired={view.retired} finished={session?.finished ? session : null} onStart={(minutes, shorter) => void start(minutes, shorter)} />
  </>

  const done = active.completed
  const total = done + active.queue.length
  const controls = <div className="practice-session-controls">
    {running && task && <button className="soft-button" disabled={busy} onClick={() => void pause()}><Pause size={16} />{t.pause}</button>}
    <button className="soft-button" disabled={busy} onClick={() => void finish()}><Check size={16} />{t.finish}</button>
  </div>
  // With nothing left to answer the card's own Finish is the one action, so the header has none.
  const header = <header className="practice-header practice-header-active"><span className="eyebrow">{t.goalEyebrow(active.targetMinutes)}</span>{task && controls}</header>

  if (!task) return <>
    {header}
    {error}
    <section className="section-card practice-welcome">
      <span className="eyebrow">{active.completed ? t.goalReached : t.outOfExercises}</span>
      <h2>{active.completed ? t.nicelyDone : t.noMoreExercises}</h2>
      <SessionSummary t={t} session={active} />
      <button className="primary-button practice-start" disabled={busy} onClick={() => void finish()}>{t.finishSession}<ArrowRight size={18} /></button>
    </section>
  </>

  if (!running) return <>
    {header}
    {error}
    <section className="section-card practice-welcome">
      <span className="eyebrow">{t.placeSaved}</span>
      <h2>{t.pickUp}</h2>
      <p>{t.pausedBody(done, active.draft?.taskId === task.id)}</p>
      <button className="primary-button practice-start" disabled={busy} onClick={() => void resume()}>{t.resume}<ArrowRight size={18} /></button>
    </section>
  </>

  const typed = TYPED_KINDS.includes(task.kind)
  const revealed = response?.revealed
  const hinted = response?.assistance === 'hint'
  const submit = (value = answer): void => { if (!busy) void send('answer', { answer: value, responseMs: Math.max(0, performance.now() - startedAt.current) }) }
  const ready = task.kind === 'sort' || task.kind === 'match'
    ? Object.keys(parsePlacement(answer) || {}).length === (task.items || []).length
    : Boolean(answer.trim())

  return <>
    {header}
    <div className="practice-progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label={t.eyebrow}><span style={{ width: `${total ? Math.round(done / total * 100) : 0}%` }} /></div>
    {error}
    <section className="flash-card practice-card" key={task.id}>
      <div className="card-topline"><span className="prompt-type">{t.kind[task.kind]}</span><span className="practice-step">{Math.min(done + 1, total)} / {total}</span>{task.retry > 0 && <span className="status-chip learning"><RotateCcw size={12} />{t.again}</span>}</div>
      {t.instruction[task.kind] && !revealed && <p className="practice-instruction">{t.instruction[task.kind]}</p>}
      <TaskPrompt t={t} task={task} />
      {!revealed && (task.kind === 'flash'
        ? <FlashBoard t={t} task={task} revealedAnswer={answer === REVEALED} busy={busy} onReveal={() => setAnswer(REVEALED)} onRate={(rating) => submit(rating)} />
        : <form className="answer-form" onSubmit={(event) => { event.preventDefault(); submit() }}>
          <AnswerInput t={t} task={task} answer={answer} picked={picked} busy={busy} onAnswer={setAnswer} onPicked={(next) => { setPicked(next); setAnswer(next.map((index) => (task.choices || [])[index]).join(' ')) }} onSubmit={() => submit()} />
          <button className="primary-button answer-submit" disabled={busy || (!typed && !ready)}>{busy ? t.checking : typed && !answer.trim() ? t.dontKnow : t.check}<ArrowRight size={17} /></button>
          {!typed
            ? <button className="practice-text-button" type="button" disabled={busy} onClick={() => submit('')}>{t.dontKnow}</button>
            : !hinted && <button className="practice-text-button" type="button" disabled={busy} onClick={() => void send('help')}><Lightbulb size={15} />{t.showHint}</button>}
          {hinted && <div className="practice-hint">{task.hint}</div>}
        </form>)}
      {revealed && response && <div className="practice-feedback" aria-live="polite">
        <span className={`practice-verdict ${response.result}`}>{verdictOf(t, response)}</span>
        {feedbackOf(t, task, response) && <p>{feedbackOf(t, task, response)}</p>}
        <FeedbackAnswers t={t} task={task} response={response} />
        {response.reported
          ? <p className="practice-reported" role="status"><Flag size={14} />{t.reported}</p>
          : isReportable(task, response) && <button className="practice-text-button" type="button" disabled={busy} onClick={() => void send('report')}><Flag size={15} />{t.reportCorrect}</button>}
        <button className="primary-button practice-continue" disabled={busy} onClick={() => void send('next')} autoFocus>{t.continue}<ArrowRight size={17} /></button>
      </div>}
    </section>
    <p className="practice-footnote">{t.footnote}</p>
  </>
}

/** What the exercise asks, above its controls. */
function TaskPrompt({ t, task }: { t: PracticeCopy; task: PracticeTask }): JSX.Element | null {
  if (task.kind === 'match' || task.kind === 'sort' || task.kind === 'odd') return null
  if (task.kind === 'dialogue') {
    return <div className="practice-dialogue">
      {task.support && <p className="practice-context">{task.support}</p>}
      <p className="practice-speech" lang="da"><MessageCircle size={16} aria-hidden="true" />{task.prompt}</p>
    </div>
  }
  if (task.kind === 'binary') {
    return <div className="practice-prompt"><h2>{t.claim(task.prompt, task.claim || '')}</h2></div>
  }
  const promptIsDanish = !['produce', 'assemble'].includes(task.kind)
  return <>
    {task.kind === 'sense' && <p className="practice-sense-lead">{t.senseLead(task.danish)}</p>}
    <div className="practice-prompt">
      <h2 lang={promptIsDanish ? 'da' : undefined}>{task.prompt}</h2>
      {task.kind === 'cloze' && (task.context || task.translation) && <p className="practice-context">{task.context || task.translation}</p>}
      {task.kind === 'produce' && task.answerIsSentence && <p className="practice-context">{t.wholeSentence}</p>}
    </div>
    {task.kind === 'sense' && task.contrast && <div className="practice-contrast"><span>{t.otherMeaning}</span><p lang="da">{task.contrast}</p></div>}
  </>
}

/** The control each format answers with. Every one works by tap and by keyboard. */
function AnswerInput({ t, task, answer, picked, busy, onAnswer, onPicked, onSubmit }: {
  t: PracticeCopy; task: PracticeTask; answer: string; picked: number[]; busy: boolean
  onAnswer: (value: string) => void; onPicked: (next: number[]) => void; onSubmit: () => void
}): JSX.Element {
  const enterSubmits = (event: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      onSubmit()
    }
  }
  switch (task.kind) {
    case 'assemble':
      return <WordBank t={t} tiles={task.choices || []} picked={picked} disabled={busy} onChange={onPicked} />
    case 'binary':
      return <ChoiceList label={t.kind.binary} options={[{ value: 'true', label: t.isTrue }, { value: 'false', label: t.isFalse }]} chosen={answer} disabled={busy} onChoose={onAnswer} danish={false} />
    case 'match':
      return <MatchBoard t={t} task={task} answer={answer} disabled={busy} onChange={onAnswer} />
    case 'sort':
      return <SortBoard t={t} task={task} answer={answer} disabled={busy} onChange={onAnswer} />
    case 'cloze':
      return <><label htmlFor="practice-answer">{t.missingWord}</label><input id="practice-answer" className="practice-cloze-input" value={answer} onChange={(event) => onAnswer(event.target.value)} onKeyDown={enterSubmits} readOnly={busy} maxLength={200} placeholder={t.typeWord} autoFocus autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} lang="da" /></>
    case 'produce':
      return <><label htmlFor="practice-answer">{t.yourDanish}</label><textarea id="practice-answer" value={answer} onChange={(event) => onAnswer(event.target.value)} onKeyDown={enterSubmits} readOnly={busy} maxLength={2000} rows={2} placeholder={t.typeDanish} autoFocus autoCapitalize="sentences" autoCorrect="off" spellCheck={false} lang="da" /></>
    default: {
      const danish = task.kind === 'choose' || task.kind === 'odd' || task.kind === 'dialogue'
      return <ChoiceList label={t.kind[task.kind]} options={(task.choices || []).map((choice) => ({ value: choice, label: choice }))} chosen={answer} disabled={busy} onChoose={onAnswer} danish={danish} />
    }
  }
}

/** Flash-reveal: reveal first, then a self-rating that is recorded as exactly that. */
function FlashBoard({ t, task, revealedAnswer, busy, onReveal, onRate }: { t: PracticeCopy; task: PracticeTask; revealedAnswer: boolean; busy: boolean; onReveal: () => void; onRate: (rating: 'known' | 'unknown') => void }): JSX.Element {
  if (!revealedAnswer) return <div className="answer-form"><button type="button" className="primary-button answer-submit" onClick={onReveal}><Eye size={17} />{t.reveal}</button></div>
  return <div className="answer-form">
    <div className="correct-answer"><span>{t.meaning}</span><strong>{task.answer}</strong></div>
    <div className="practice-self-rating" role="group" aria-label={t.selfRated}>
      <button type="button" className="soft-button" disabled={busy} onClick={() => onRate('known')}><Check size={16} />{t.knewIt}</button>
      <button type="button" className="soft-button" disabled={busy} onClick={() => onRate('unknown')}><X size={16} />{t.notYet}</button>
    </div>
    <small className="practice-self-note">{t.selfRated}</small>
  </div>
}

/**
 * Matching: tap a Danish word, then a meaning. A placed pair can be undone by tapping the word
 * again. Nothing is judged until Check, and then each word is judged on its own.
 */
function MatchBoard({ t, task, answer, disabled, onChange }: { t: PracticeCopy; task: PracticeTask; answer: string; disabled: boolean; onChange: (value: string) => void }): JSX.Element {
  const [selected, setSelected] = useState<string | null>(null)
  const placement = parsePlacement(answer) || {}
  const used = new Set(Object.values(placement))
  function place(meaning: string): void {
    if (!selected) return
    const next = Object.fromEntries(Object.entries(placement).filter(([, value]) => value !== meaning))
    next[selected] = meaning
    onChange(JSON.stringify(next))
    setSelected(null)
  }
  function tapWord(text: string): void {
    if (placement[text]) {
      const { [text]: _removed, ...rest } = placement
      onChange(JSON.stringify(rest))
      setSelected(text)
      return
    }
    setSelected(selected === text ? null : text)
  }
  return <div className="practice-match">
    <div className="practice-match-column" role="group" aria-label={t.danishColumn}>
      <span className="practice-column-label">{t.danishColumn}</span>
      {(task.items || []).map((item) => (
        <button key={item.text} type="button" lang="da" aria-pressed={selected === item.text} className={`practice-tile ${selected === item.text ? 'chosen' : ''} ${placement[item.text] ? 'placed' : ''}`} disabled={disabled} onClick={() => tapWord(item.text)}>
          <span>{item.text}</span>{placement[item.text] && <small>{placement[item.text]}</small>}
        </button>
      ))}
    </div>
    <div className="practice-match-column" role="group" aria-label={t.meaningColumn}>
      <span className="practice-column-label">{t.meaningColumn}</span>
      {(task.choices || []).map((meaning) => (
        <button key={meaning} type="button" className={`practice-tile ${used.has(meaning) ? 'used' : ''}`} disabled={disabled || !selected} onClick={() => place(meaning)}>{meaning}</button>
      ))}
    </div>
  </div>
}

/** Sorting: tap a noun, then its group. A placed noun can be tapped again to move it. */
function SortBoard({ t, task, answer, disabled, onChange }: { t: PracticeCopy; task: PracticeTask; answer: string; disabled: boolean; onChange: (value: string) => void }): JSX.Element {
  const [selected, setSelected] = useState<string | null>(null)
  const placement = parsePlacement(answer) || {}
  const unplaced = (task.items || []).filter((item) => !placement[item.text])
  function place(category: string): void {
    if (!selected) return
    onChange(JSON.stringify({ ...placement, [selected]: category }))
    setSelected(null)
  }
  function lift(text: string): void {
    const { [text]: _removed, ...rest } = placement
    onChange(JSON.stringify(rest))
    setSelected(text)
  }
  return <div className="practice-sort">
    <div className="practice-bank-tiles" role="group" aria-label={t.unplaced}>
      {unplaced.map((item) => <button key={item.text} type="button" lang="da" aria-pressed={selected === item.text} className={`practice-tile ${selected === item.text ? 'chosen' : ''}`} disabled={disabled} onClick={() => setSelected(selected === item.text ? null : item.text)}>{item.text}</button>)}
      {!unplaced.length && <span className="practice-bank-empty">{t.allPlaced}</span>}
    </div>
    {unplaced.length > 0 && <small className="practice-sort-help">{t.unplaced}</small>}
    <div className="practice-sort-groups">
      {(task.categories || []).map((category) => (
        <div key={category} className="practice-sort-group">
          <button type="button" className="practice-sort-target" disabled={disabled || !selected} onClick={() => place(category)}>{t.categoryName(category)}</button>
          <div className="practice-sort-placed">
            {(task.items || []).filter((item) => placement[item.text] === category).map((item) => <button key={item.text} type="button" lang="da" className="practice-tile placed" disabled={disabled} onClick={() => lift(item.text)}>{item.text}</button>)}
          </div>
        </div>
      ))}
    </div>
  </div>
}

function verdictOf(t: PracticeCopy, response: PracticeResponse): string {
  if (isFeedbackCode(response.feedback)) return t.verdict[response.feedback]
  switch (response.result) {
    case 'correct': return t.verdict.correct
    case 'mostly': return t.verdict.mostly
    case 'unverified': return t.verdict.unverified
    case 'dont_know': return t.verdict.dont_know
    default: return t.verdict.incorrect
  }
}

/** The feedback line. A session saved before feedback codes still shows its stored sentence. */
function feedbackOf(t: PracticeCopy, task: PracticeTask, response: PracticeResponse): string {
  if (!isFeedbackCode(response.feedback)) return response.feedback
  const targets = response.targets || []
  return t.feedback[response.feedback]({ answer: task.answer, right: targets.filter((target) => target.result === 'correct').length, total: targets.length })
}

/** The duration picker, shown at every start. It never starts on its own. */
function PracticeStart({ t, busy, shortfall, retired, finished, onStart }: { t: PracticeCopy; busy: boolean; shortfall: Shortfall | null; retired: boolean; finished: PracticeSessionState | null; onStart: (minutes: number, acceptShorter: boolean) => void }): JSX.Element {
  const [preset, setPreset] = useState<number | 'custom'>(DEFAULT_PRACTICE_MINUTES)
  const [custom, setCustom] = useState('15')
  const minutes = preset === 'custom' ? Number(custom) : preset
  const valid = isPracticeMinutes(minutes)
  const empty = shortfall?.availableMinutes === 0

  return <section className="section-card practice-welcome">
    <span className="eyebrow">{finished ? t.doneEyebrow : t.eyebrow}</span>
    <h1>{finished ? t.titleAgain : t.titleStart}</h1>
    {finished ? <SessionSummary t={t} session={finished} /> : <p>{t.intro}</p>}
    {retired && <p className="practice-quiet-note">{t.retired}</p>}
    {empty
      ? <div className="practice-shortfall" role="status"><p>{t.emptyMaterial}</p><Link className="primary-button practice-start" href="/review">{t.openReview}<ArrowRight size={18} /></Link></div>
      : shortfall
        ? <div className="practice-shortfall" role="status">
            <p>{t.shortfall(shortfall.availableMinutes, shortfall.requestedMinutes)}</p>
            <button className="primary-button practice-start" disabled={busy} onClick={() => onStart(shortfall.requestedMinutes, true)}>{t.startShorter(shortfall.availableMinutes)}<ArrowRight size={18} /></button>
          </div>
        : <>
            <fieldset className="practice-duration" disabled={busy}>
              <legend className="eyebrow">{t.howLong}</legend>
              <div className="practice-duration-options" role="radiogroup" aria-label={t.howLong}>
                {PRACTICE_MINUTE_PRESETS.map((value) => <button key={value} type="button" role="radio" aria-checked={preset === value} className={`practice-duration-option ${preset === value ? 'chosen' : ''}`} onClick={() => setPreset(value)}>{t.minuteOption(value)}</button>)}
                <button type="button" role="radio" aria-checked={preset === 'custom'} className={`practice-duration-option ${preset === 'custom' ? 'chosen' : ''}`} onClick={() => setPreset('custom')}>{t.custom}</button>
              </div>
              {preset === 'custom' && <label className="practice-duration-custom">
                <input type="number" inputMode="numeric" min={1} max={MAX_PRACTICE_MINUTES} step={1} value={custom} onChange={(event) => setCustom(event.target.value)} aria-describedby="practice-duration-help" />
                <span>{t.minutesWord}</span>
                <small id="practice-duration-help">{valid ? t.upTo(MAX_PRACTICE_MINUTES) : t.chooseMinutes(MAX_PRACTICE_MINUTES)}</small>
              </label>}
            </fieldset>
            <button className="primary-button practice-start" disabled={busy || !valid} onClick={() => onStart(minutes, false)}>{busy ? t.preparing : t.start}<ArrowRight size={18} /></button>
          </>}
    {!empty && <Link className="practice-review-link" href="/review">{t.reviewInstead}</Link>}
  </section>
}

function SessionSummary({ t, session }: { t: PracticeCopy; session: PracticeSessionState }): JSX.Element {
  const attempts = session.attempts
  const right = attempts.filter((attempt) => attempt.result === 'correct' || attempt.result === 'mostly').length
  const minutes = Math.max(1, Math.round(session.elapsedSeconds / 60))
  return <p>{t.summary(attempts.length, minutes, right)}</p>
}

/**
 * What the learner answered next to what was expected. A typed Danish answer that was not fully
 * right is diffed; a group board lists each word with its own outcome.
 */
function FeedbackAnswers({ t, task, response }: { t: PracticeCopy; task: PracticeTask; response: PracticeResponse }): JSX.Element | null {
  const typed = response.answer.trim()
  if (task.kind === 'match' || task.kind === 'sort') {
    const placement = parsePlacement(response.answer) || {}
    return <ul className="practice-outcomes">
      {(task.items || []).map((item) => {
        const right = placement[item.text] === item.answer
        const shown = task.kind === 'sort' ? t.categoryName(item.answer) : item.answer
        return <li key={item.text} className={right ? 'correct' : 'incorrect'}>
          {right ? <Check size={15} aria-hidden="true" /> : <X size={15} aria-hidden="true" />}
          <strong lang="da">{item.text}</strong><span>{shown}</span>
        </li>
      })}
    </ul>
  }
  if (task.kind === 'flash') return <div className="correct-answer"><span>{t.meaning}</span><strong>{task.answer}</strong></div>
  if (task.kind === 'binary') return null
  if (response.result === 'unverified') {
    return <div className="practice-diff">
      <div><small>{t.yourSentence}</small><p lang="da">{typed}</p></div>
      <div><small>{t.savedSentence}</small><p lang="da">{task.answer}</p></div>
    </div>
  }
  // An unverified answer may be right, so it is shown beside the saved one rather than marked up.
  const comparable = typed && response.result !== 'correct' && ['produce', 'cloze', 'assemble'].includes(task.kind)
  const diff = comparable ? diffAnswer(typed, task.answer) : null
  const label = task.kind === 'sense' || task.kind === 'pick' ? t.meaning : t.answer
  const answerIsDanish = !['sense', 'pick'].includes(task.kind)
  if (diff && !diff.identical) {
    return <div className="practice-diff">
      <div><small>{t.yourAnswer}</small><p lang="da">{diff.actual.map((part, index) => part.changed ? <mark key={index} className="diff-wrong">{part.text}</mark> : <span key={index}>{part.text}</span>)}</p></div>
      <div><small>{label}</small><p lang="da">{diff.expected.map((part, index) => part.changed ? <mark key={index} className="diff-fixed">{part.text}</mark> : <span key={index}>{part.text}</span>)}</p></div>
    </div>
  }
  const wrongTap = isChoiceKind(task.kind) && response.result === 'incorrect' && typed
  return <>
    <div className="correct-answer"><span>{label}</span><strong lang={answerIsDanish ? 'da' : undefined}>{task.answer}</strong></div>
    {task.accepted?.length ? <div className="correct-answer practice-also"><span>{t.alsoAccepted}</span>{task.accepted.map((accepted) => <strong key={accepted} lang="da">{accepted}</strong>)}</div> : null}
    {wrongTap && <p className="practice-your-answer"><small>{t.yourAnswer}</small><mark className="diff-wrong">{typed}</mark></p>}
  </>
}

/**
 * The word bank. Tiles move between the bank and the built line; tapping a placed tile takes it
 * back. Indices rather than texts are tracked, so a sentence that repeats a word still works.
 */
function WordBank({ t, tiles, picked, disabled, onChange }: { t: PracticeCopy; tiles: string[]; picked: number[]; disabled: boolean; onChange: (next: number[]) => void }): JSX.Element {
  const remaining = tiles.map((_, index) => index).filter((index) => !picked.includes(index))
  return <div className="practice-bank">
    <div className="practice-bank-line" aria-live="polite">
      {picked.length
        ? picked.map((index, position) => <button key={`${index}-${position}`} type="button" className="practice-tile placed" disabled={disabled} onClick={() => onChange(picked.filter((_, at) => at !== position))} lang="da">{tiles[index]}</button>)
        : <span className="practice-bank-empty">{t.tapInOrder}</span>}
    </div>
    <div className="practice-bank-tiles">
      {remaining.map((index) => <button key={index} type="button" className="practice-tile" disabled={disabled} onClick={() => onChange([...picked, index])} lang="da">{tiles[index]}</button>)}
      {!remaining.length && <span className="practice-bank-empty">{t.allPlaced}</span>}
    </div>
    {picked.length > 0 && <button type="button" className="practice-text-button" disabled={disabled} onClick={() => onChange([])}>{t.clear}</button>}
  </div>
}

/** Options for a gap, a meaning, a reply, true or false, or an odd one out. One stays selected until submitted. */
function ChoiceList({ label, options, chosen, disabled, onChoose, danish }: { label: string; options: { value: string; label: string }[]; chosen: string; disabled: boolean; onChoose: (value: string) => void; danish: boolean }): JSX.Element {
  return <div className="practice-choices" role="radiogroup" aria-label={label}>
    {options.map((option, index) => <button key={`${option.value}-${index}`} type="button" role="radio" aria-checked={chosen === option.value} className={`practice-choice ${chosen === option.value ? 'chosen' : ''}`} disabled={disabled} onClick={() => onChoose(option.value)} lang={danish ? 'da' : undefined}>{option.label}</button>)}
  </div>
}
