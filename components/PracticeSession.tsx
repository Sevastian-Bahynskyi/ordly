'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type JSX, type KeyboardEvent } from 'react'
import { ArrowRight, Check, Lightbulb, MessageCircle, Pause, RotateCcw, Sparkles, ThumbsUp } from 'lucide-react'
import { diffAnswer } from '@/lib/answer-diff'
import { isChoiceKind, type PracticeKind, type PracticeResponse, type PracticeSessionState, type PracticeSummary, type PracticeTask } from '@/lib/practice'
import { isPracticeStore, isRecord } from '@/lib/practice-validation'

type PracticeView = { revision: number; session: PracticeSessionState | null; summary: PracticeSummary }
const exerciseKinds = ['Pick the meaning', 'Fill the gap', 'Build the sentence', 'Type the missing word', 'Say it in Danish']
const kindLabels: Record<PracticeKind, string> = {
  pick: 'Pick the meaning', choose: 'Fill the gap', assemble: 'Build the sentence', cloze: 'Type the missing word',
  produce: 'Say it in Danish', recall: 'What does it mean?', sense: 'Which meaning is this?',
  build: 'Change the sentence', dialogue: 'Keep the exchange going', listen: 'Reply in Danish', teach: 'Connect meaning & situation',
}
/** Kinds whose answer is typed Danish, so a wrong answer can be compared letter by letter. */
const typedDanishKinds: readonly PracticeKind[] = ['produce', 'cloze', 'build', 'dialogue', 'listen']
/** Open replies: the model answer is one of many, so only an actual correction is diffed. */
const openKinds: readonly PracticeKind[] = ['build', 'dialogue', 'listen']
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
  const [picked, setPicked] = useState<number[]>([])
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
    setPicked([])
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

  // Every answer, hint and rating is already saved as it happens. There is deliberately no timed
  // autosave: it used to flip `busy` every 15 seconds, which disabled the answer field mid-word,
  // dropped its focus and greyed out Check answer.
  useEffect(() => {
    if (!running || !task) return
    function hide(): void {
      if (document.visibilityState === 'hidden') {
        setRunning(false)
        void send('pause')
      }
    }
    document.addEventListener('visibilitychange', hide)
    return () => document.removeEventListener('visibilitychange', hide)
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
    <header className="practice-header"><div><span className="eyebrow">USEFUL DANISH · AT YOUR PACE</span><h1>{session?.finished ? 'A little more Danish, ready to use.' : 'Your new words and your weakest ones.'}</h1><p>About 10 items, two exercises each, from easy to hard. Stay longer or finish whenever you feel done.</p></div></header>
    {error}
    <section className="section-card practice-welcome">
      <div className="practice-mark"><MessageCircle size={30} /></div>
      <span className="eyebrow">{session?.finished ? 'SESSION RESULTS' : session ? 'YOUR PLACE IS SAVED' : 'GUIDED PRACTICE'}</span>
      <h2>{session?.finished ? `${session.completed} practice steps finished.` : task ? 'Pick up where you left off.' : session ? 'Ready for more?' : 'Move from knowing a word to using it.'}</h2>
      <p>{session?.finished ? 'Your rated answers are saved. Unfinished exercises were not marked as completed.' : task ? `${task.retry ? 'A retry is waiting. ' : ''}${session.queue.length} steps in this batch. Pause to return later, or finish to see your results.` : session ? 'This batch is complete. Load more practice, pause, or finish your session.' : 'Built from what you saved: new items first, then the ones you miss most. Missed answers come back a few steps later.'}</p>
      {session?.finished && <div className="practice-evidence-grid">
        <div><span>Targets practised</span><strong>{new Set(session.attempts.map((attempt) => attempt.targetKey)).size}</strong></div>
        <div><span>Unaided recalls</span><strong>{session.attempts.filter((attempt) => attempt.assistance === 'none' && attempt.modality === 'typed' && attempt.rating !== 1 && ['correct', 'mostly'].includes(attempt.result)).length}</strong></div>
        <div><span>Retry ratings</span><strong>{session.attempts.filter((attempt) => attempt.rating === 1).length}</strong></div>
      </div>}
      {!session && <div className="practice-outline">{exerciseKinds.map((kind) => <div key={kind}>{kind}</div>)}</div>}
      {(!session || session.finished) && <label className="practice-ai-option"><input type="checkbox" checked={aiEnabled} onChange={(e) => setAiEnabled(e.target.checked)} /><span><strong>Use AI coaching notes</strong><small>Shows written coaching on a typed answer, and unlocks generated memory examples. Either way, a typed answer that the local check cannot accept is still sent to our AI provider to check for a valid alternative, so a correct answer is not marked wrong. Tapped options and missing words are checked on our own servers and never sent.</small></span></label>}
      <button className="primary-button practice-start" disabled={busy} onClick={() => void start()}>{busy ? 'Preparing…' : task ? 'Resume practice' : session && !session.finished ? 'Keep practising' : 'Start practice'}<ArrowRight size={18} /></button>
      {session && !session.finished && <div className="practice-session-actions">{running && <button className="soft-button" disabled={busy} onClick={() => void pause()}><Pause size={16} />Pause</button>}<button className="soft-button" disabled={busy} onClick={() => void finish()}><Check size={16} />Finish session</button></div>}
      <Link className="practice-review-link" href="/review">Ordinary FSRS review →</Link>
    </section>
    <PracticeProgress summary={view.summary} />
    <p className="practice-footnote">Practice is saved to your account. These observations measure recall, not a CEFR level.</p>
  </>

  const teaching = task.kind === 'teach'
  const choiceKind = isChoiceKind(task.kind)
  const tiles = task.choices || []
  const chosen = response?.assistance === 'choices'
  const help = response?.assistance && response.assistance !== 'none'
  const revealed = response?.revealed
  // A correct tap is still a success worth a Good; only genuine help suggests Again.
  const suggested = (help && !chosen) || response?.result === 'incorrect' ? 1 : response?.result === 'mostly' ? 2 : 3
  const done = session.completed
  const total = done + session.queue.length
  const prompt = ['listen', 'dialogue'].includes(task.kind) && task.audioText ? task.audioText : task.prompt
  const promptIsDanish = !['recall', 'produce', 'assemble', 'teach', 'build'].includes(task.kind)
  const submit = (): void => { if (!busy) void send('answer', { answer, modality: 'typed', replays: 0 }) }
  const enterSubmits = (event: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit()
    }
  }
  return <>
    <header className="practice-header practice-header-active"><div><span className="eyebrow">DAILY PRACTICE</span><h1>{kindLabels[task.kind]}</h1></div><div className="practice-session-controls"><button className="soft-button" disabled={busy} onClick={() => void pause()}><Pause size={16} />Pause</button><button className="soft-button" disabled={busy} onClick={() => void finish()}><Check size={16} />Finish session</button></div></header>
    <div className="practice-progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Session progress"><span style={{ width: `${total ? Math.round(done / total * 100) : 0}%` }} /></div>
    {error}
    <section className="flash-card practice-card" key={task.id}>
      <div className="card-topline"><span className="prompt-type">{kindLabels[task.kind]}</span><span className="practice-step">{Math.min(done + 1, total)} / {total}</span>{task.retry > 0 && <span className="status-chip learning"><RotateCcw size={12} />Retry</span>}</div>
      {task.kind === 'sense' && <p className="practice-sense-lead">Two sentences, one word — <strong lang="da">{task.danish}</strong> — two different meanings. Which meaning does the first sentence use?</p>}
      <div className="practice-prompt">
        <h2 lang={promptIsDanish ? 'da' : undefined}>{prompt}</h2>
        {task.kind === 'cloze' && (task.context || task.translation) && <p className="practice-context">{task.context || task.translation}</p>}
        {task.kind === 'produce' && task.answerIsSentence && <p className="practice-context">Write the whole sentence in Danish.</p>}
        {teaching && <><strong lang="da">{task.danish}</strong><p>{task.translation}</p><p className="practice-explanation">{task.hint}</p>{task.example !== task.danish && <p lang="da">{task.example}</p>}</>}
      </div>
      {task.kind === 'sense' && task.contrast && <div className="practice-contrast"><span>The other meaning appears here</span><p lang="da">{task.contrast}</p></div>}
      {teaching ? <div className="practice-teach-action"><p>Picture one real situation where you would say this, then recall it with the answer hidden.</p><button className="primary-button" disabled={busy} onClick={() => void send('rate', { rating: null, replays: 0 })}>Hide it & keep practising<ArrowRight size={17} /></button></div> : <>
        {!revealed && <form className="answer-form" onSubmit={(event) => { event.preventDefault(); submit() }}>
          {choiceKind ? (task.kind === 'assemble'
            ? <WordBank tiles={tiles} picked={picked} disabled={busy} onChange={(next) => { setPicked(next); setAnswer(next.map((index) => tiles[index]).join(' ')) }} />
            : <ChoiceList task={task} tiles={tiles} chosen={answer} disabled={busy} onChoose={setAnswer} />)
            : task.kind === 'cloze'
              ? <><label htmlFor="practice-answer">The missing word</label><input id="practice-answer" className="practice-cloze-input" value={answer} onChange={(event) => setAnswer(event.target.value)} onKeyDown={enterSubmits} readOnly={busy} maxLength={200} placeholder="Type the word…" autoFocus autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} lang="da" /></>
              : <><label htmlFor="practice-answer">{task.kind === 'recall' ? 'What does it mean?' : 'Your Danish answer'}</label><textarea id="practice-answer" value={answer} onChange={(event) => setAnswer(event.target.value)} onKeyDown={enterSubmits} readOnly={busy} maxLength={2000} rows={2} placeholder={task.kind === 'recall' ? 'Recall the meaning…' : 'Form your own answer…'} autoFocus autoCapitalize="sentences" autoCorrect="off" spellCheck={false} lang={task.kind === 'recall' ? undefined : 'da'} /></>}
          <button className="primary-button answer-submit" disabled={busy || (choiceKind && !answer.trim())}>{busy ? 'Checking…' : choiceKind ? 'Check this' : answer.trim() ? 'Check answer' : 'I don’t know — show me'}<ArrowRight size={17} /></button>
          <button className="practice-text-button" type="button" disabled={busy} onClick={() => void send('help', { help: 'hint', replays: 0 })}><Lightbulb size={15} />Help me remember</button>
          {help && <div className="practice-hint">{task.hint}<small>This is supported practice. You’ll try again with the answer hidden.</small></div>}
        </form>}
        {revealed && response && <div className="practice-feedback" aria-live="polite">
          <span className={`practice-verdict ${response.result}`}>{practiceVerdict(response, chosen)}</span>
          <p>{response.feedback}</p>
          {task.objective === 'production' && response.communication === 'yes' && response.target === 'no' && <p>Your reply works, but it did not retrieve this target expression. We’ll practise the target again.</p>}
          <FeedbackAnswers task={task} response={response} />
          {/* D5: only a typed meaning can become a sense. The learner still picks the rating below. */}
          {task.kind === 'recall' && response.modality === 'typed' && response.answer.trim() && response.result !== 'correct' && <button className="soft-button accept-answer-button" disabled={busy} onClick={() => void send('accept')}><ThumbsUp size={15} />My answer was right</button>}
          {(response.result === 'incorrect' || help || task.source === 'ai') && <div className="practice-repair"><Lightbulb size={18} /><div><strong>Give it a useful connection</strong><p>{task.hint}</p>{task.example !== task.danish && task.example.trim() !== task.hint.trim() && <p className="practice-example" lang="da">{task.example}</p>}<p>Think of a moment you would use it. It comes back after a few more steps.</p></div></div>}
          {session.aiEnabled && session.aiCalls < 12 && <button className="practice-text-button" disabled={busy} onClick={() => void send('repair')}><Sparkles size={15} />Create two AI memory examples</button>}
          <div className="rating-title"><span>How did recall feel?</span><small>{chosen ? (task.kind === 'sense' || task.kind === 'pick' ? 'Tapping trains recognition; typed steps follow.' : 'You’ll meet this again with the options removed.') : help ? 'Helped answers return for an unaided retry.' : task.objective ? 'You decide the FSRS rating.' : 'Rate this practice; your word schedules stay separate.'}</small></div>
          <div className="rating-grid practice-rating-grid">{ratings.map((rating) => <button key={rating.value} className={`rating-button ${rating.cls} ${suggested === rating.value ? 'suggested' : ''}`} disabled={busy} onClick={() => void send('rate', { rating: rating.value, replays: 0 })}><strong>{rating.label}</strong><span>{rating.detail}</span></button>)}</div>
        </div>}
      </>}
    </section>
    <div className="practice-bottom-note"><Sparkles size={15} /><span>{choiceKind ? 'Tapped answers train this meaning only. They never advance your word’s review schedule.' : task.cardId ? 'This answer also moves your word’s review schedule.' : 'Typed Danish has its own FSRS schedule.'}</span></div>
  </>
}

/**
 * What the learner answered next to what was expected. A typed Danish answer that was not fully
 * right is diffed: what they got wrong is red in their answer, what they missed is green in the
 * correction. The correction is the semantic check's minimal fix of their own sentence when there
 * is one, so a valid different reply is not painted red against the model answer.
 */
function FeedbackAnswers({ task, response }: { task: PracticeTask; response: PracticeResponse }): JSX.Element {
  const typed = response.answer.trim()
  const correction = response.correction?.trim() || ''
  const reference = correction || (openKinds.includes(task.kind) ? '' : task.answer)
  const comparable = typed && reference && response.result !== 'correct'
    && (typedDanishKinds.includes(task.kind) || task.kind === 'assemble')
  const diff = comparable ? diffAnswer(typed, reference) : null
  const modelLabel = openKinds.includes(task.kind) ? 'One possible reply' : task.kind === 'sense' || task.kind === 'pick' ? 'The meaning' : 'Answer to recall'
  const answerIsDanish = !['recall', 'sense', 'pick'].includes(task.kind)

  if (response.relation === 'grammar_adjustment' && correction) {
    return <>
      <div className="correct-answer practice-rephrase"><span>With “{typed}”, say</span><strong lang="da">{correction}</strong></div>
      {normalized(correction) !== normalized(task.answer) && <div className="correct-answer"><span>Original target</span><strong lang="da">{task.answer}</strong></div>}
    </>
  }

  if (diff && !diff.identical) {
    return <>
      <div className="practice-diff">
        <div><small>Your answer</small><p lang="da">{diff.actual.map((part, index) => part.changed ? <mark key={index} className="diff-wrong">{part.text}</mark> : <span key={index}>{part.text}</span>)}</p></div>
        <div><small>{correction ? 'Corrected' : modelLabel}</small><p lang="da">{diff.expected.map((part, index) => part.changed ? <mark key={index} className="diff-fixed">{part.text}</mark> : <span key={index}>{part.text}</span>)}</p></div>
      </div>
      {correction && openKinds.includes(task.kind) && normalized(correction) !== normalized(task.answer) && <div className="correct-answer"><span>{modelLabel}</span><strong lang="da">{task.answer}</strong></div>}
    </>
  }
  const wrongTap = response.assistance === 'choices' && response.result === 'incorrect' && typed
  return <>
    <div className="correct-answer"><span>{modelLabel}</span><strong lang={answerIsDanish ? 'da' : undefined}>{task.answer}</strong></div>
    {typed && <p className="practice-your-answer"><small>Your answer</small>{wrongTap ? <mark className="diff-wrong">{typed}</mark> : typed}</p>}
  </>
}

function practiceVerdict(response: PracticeResponse, chosen: boolean): string {
  if (response.relation === 'valid_alternative') return 'Valid alternative'
  if (response.relation === 'grammar_adjustment') return 'Better with your word'
  if (response.result === 'correct') return chosen ? 'That’s the one' : 'Correct'
  if (response.result === 'mostly') return 'Close — one adjustment'
  if (response.result === 'incorrect') return 'Let’s repair this'
  return 'Compare & self-check'
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase('da-DK').replace(/[.,!?;:]+/g, '').replace(/\s+/g, ' ')
}

/**
 * The word bank (D13). Tiles move between the bank and the built line; tapping a placed tile takes
 * it back. Indices rather than texts are tracked, so a sentence that repeats a word still works.
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

/** The options for a cloze gap or a sense discrimination. One stays selected until submitted. */
function ChoiceList({ task, tiles, chosen, disabled, onChoose }: { task: PracticeTask; tiles: string[]; chosen: string; disabled: boolean; onChoose: (value: string) => void }): JSX.Element {
  const danish = task.kind === 'choose'
  return <div className="practice-choices" role="radiogroup" aria-label={danish ? 'Words for the gap' : 'Possible meanings'}>
    {tiles.map((choice, index) => <button key={`${choice}-${index}`} type="button" role="radio" aria-checked={chosen === choice} className={`practice-choice ${chosen === choice ? 'chosen' : ''}`} disabled={disabled} onClick={() => onChoose(choice)} lang={danish ? 'da' : undefined}>{choice}</button>)}
  </div>
}

function PracticeProgress({ summary }: { summary: PracticeSummary }): JSX.Element {
  return <section className="section-card practice-evidence"><div><span className="eyebrow">WHAT STAYS WITH YOU</span><h2>Recall after a day away</h2><p>Unaided, typed answers after at least 24 hours without a recorded exposure. Early practice is excluded.</p></div><div className="practice-evidence-grid">{[{ key: 'meaning', label: 'Meaning' }, { key: 'production', label: 'Danish production' }].map(({ key, label }) => {
    const score = summary[key as 'meaning' | 'production']
    return <div key={key}><span>{label}</span><strong>{score.total ? `${score.correct} / ${score.total}` : '—'}</strong><small>{score.total ? 'successful delayed attempts' : 'Building the first observations'}</small></div>
  })}</div></section>
}
