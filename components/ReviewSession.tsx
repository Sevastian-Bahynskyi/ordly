'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Flame, Loader2, RotateCcw, Sparkles, Target, ThumbsUp, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { EntrySense, LearningStatus, ReviewItem } from '@/lib/types'
import { checkAnswer, type AnswerResult } from '@/lib/answer'
import {
  activeSenses,
  createSense,
  entrySenses,
  normalizeSenseText,
  parseSenses,
  splitTranslationIntoSenses,
  translationFromSenses,
} from '@/lib/senses'
import { clozeSentence, reviewMode, type PromptMode } from '@/lib/review'
import { MemoryRing } from '@/components/MemoryRing'
import { ReviewPromptReveal } from '@/components/ReviewPromptReveal'

const ratings = [
  { value: 1, label: 'Again', hint: '< 1m', cls: 'again' },
  { value: 2, label: 'Hard', hint: 'soon', cls: 'hard' },
  { value: 3, label: 'Good', hint: 'later', cls: 'good' },
  { value: 4, label: 'Easy', hint: 'much later', cls: 'easy' },
]

type CardPatch = Pick<ReviewItem, 'due' | 'stability' | 'difficulty' | 'elapsed_days' | 'scheduled_days' | 'reps' | 'lapses' | 'learning_steps' | 'state' | 'last_review'>

type ReviewedItem = {
  item: ReviewItem
  mode: PromptMode
  answer: string
  result: AnswerResult | null
  revealedWithoutAnswer: boolean
  rating: number
  logId: string | number
  sentence: string
  sentenceTranslation: string
}

export function ReviewSession({ initialItems, linkedSenses = {}, translationLanguage = 'ru' }: {
  initialItems: ReviewItem[]
  /** Senses of each entry's synonym neighbours, keyed by entry id (D5). */
  linkedSenses?: Record<string, EntrySense[]>
  translationLanguage?: 'ru' | 'en' | 'uk'
}): React.JSX.Element {
  const languageLabel = translationLanguage === 'ru' ? 'Russian' : translationLanguage === 'uk' ? 'Ukrainian' : 'English'
  const [items, setItems] = useState(initialItems)
  const [answer, setAnswer] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [result, setResult] = useState<AnswerResult | null>(null)
  const [revealedWithoutAnswer, setRevealedWithoutAnswer] = useState(false)
  const [completed, setCompleted] = useState(0)
  const [freshSentence, setFreshSentence] = useState<{ sentence: string; translation: string } | null>(null)
  const [ratingLoading, setRatingLoading] = useState(false)
  const [checkingMeaning, setCheckingMeaning] = useState(false)
  const [acceptingAnswer, setAcceptingAnswer] = useState(false)
  const [history, setHistory] = useState<ReviewedItem[]>([])
  const [historyIndex, setHistoryIndex] = useState<number | null>(null)

  const current = items[0]
  const entry = current?.vocabulary_entries
  const entryKind = entry?.entry_kind || 'word'
  const [sessionModes] = useState(() => new Map(initialItems.map((item) => [item.id, reviewMode(item.reps, item.vocabulary_entries.entry_kind)])))
  const mode = current ? sessionModes.get(current.id) || reviewMode(current.reps, entryKind) : 'recognition'

  useEffect(() => {
    setFreshSentence(null)
    if (!current || entryKind === 'sentence' || mode !== 'cloze' || current.reps < 5) return

    const controller = new AbortController()
    fetch('/api/ai/review-sentence', {
      signal: controller.signal,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryId: current.entry_id, cycle: Math.floor(current.reps / 5) }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => !controller.signal.aborted && d?.sentence && setFreshSentence(d))
      .catch(() => {})
    return () => controller.abort()
  }, [current?.id, current?.reps, current?.entry_id, mode, entryKind])

  const candidateSentence = freshSentence?.sentence || entry?.example_sentence || ''
  const sentence = mode === 'cloze' && !clozeSentence(candidateSentence, entry?.danish || '') ? '' : candidateSentence
  const sentenceTranslation = freshSentence?.translation || entry?.example_translation || ''
  const expected = mode === 'recognition' ? entry?.translation || '' : entry?.danish || ''

  const prompt = useMemo(() => {
    if (!entry) return ''
    if (mode === 'recognition') return entry.danish
    if (mode === 'production') return entry.translation || ''
    return clozeSentence(sentence, entry.danish) || entry.translation || ''
  }, [entry, mode, sentence])

  async function submitAnswer(e: React.FormEvent) {
    e.preventDefault()
    const typedAnswer = answer.trim()

    if (!typedAnswer) {
      setResult('incorrect')
      setRevealedWithoutAnswer(true)
      setRevealed(true)
      return
    }

    // Recognition asks for the meaning, so every stored sense — and every sense of a synonym-linked
    // entry (D5) — is a valid answer. Production asks for the Danish, where senses say nothing.
    const recognition = mode === 'recognition'
    const quickResult = checkAnswer(typedAnswer, expected, {
      sentence: entryKind === 'sentence',
      senses: recognition ? entrySenses(entry) : null,
      linkedSenses: recognition && current ? linkedSenses[current.entry_id] || null : null,
    })
    if (quickResult !== 'incorrect') {
      setResult(quickResult)
      setRevealedWithoutAnswer(false)
      setRevealed(true)
      return
    }

    setCheckingMeaning(true)
    let finalResult: AnswerResult = quickResult
    try {
      const res = await fetch('/api/ai/check-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          danish: entry?.danish,
          expected,
          answer: typedAnswer,
          mode,
          language: languageLabel,
        }),
      })
      if (res.ok) {
        const body = await res.json()
        if (body.result === 'correct' || body.result === 'mostly' || body.result === 'incorrect') finalResult = body.result
      }
    } catch {
      // Keep the deterministic result if AI semantic checking is unavailable.
    }
    setCheckingMeaning(false)
    setResult(finalResult)
    setRevealedWithoutAnswer(false)
    setRevealed(true)
  }

  /**
   * `My answer was right` (D5). Neither grader knows every way a meaning can be phrased, so the
   * learner gets the last word: the verdict flips to correct — which is what the rating call
   * records and what the suggested FSRS rating is derived from — and the typed answer is stored
   * as a `source: 'user'` sense, so the deterministic checker accepts it from now on instead of
   * asking the AI again.
   *
   * The learner still picks the FSRS rating themselves (AGENTS.md §11); this never rates for them.
   */
  async function acceptTypedAnswer() {
    const typed = answer.trim()
    if (!current || !entry || !typed || acceptingAnswer) return

    setAcceptingAnswer(true)
    // A row written before the senses migration has an empty array; deriving the base from its
    // translation first is what stops the update from replacing every meaning with this one.
    const stored = parseSenses(entry.senses)
    const base: EntrySense[] = stored.length
      ? stored
      : splitTranslationIntoSenses(entry.translation, entryKind === 'sentence' ? 'sentence' : 'word')
    const typedKey = normalizeSenseText(typed)
    const known = activeSenses(base).some((sense) => normalizeSenseText(sense.text) === typedKey)

    // A sentence keeps exactly one sense (plan §3.2): for a sentence only the verdict flips.
    if (!known && typedKey && entryKind !== 'sentence') {
      const nextSenses = [...base, createSense(typed, { source: 'user' })]
      const { error } = await createClient()
        .from('vocabulary_entries')
        .update({ senses: nextSenses })
        .eq('id', entry.id)

      if (!error) {
        const nextTranslation = translationFromSenses(nextSenses)
        setItems((queue) => queue.map((queued) => queued.entry_id === entry.id
          ? { ...queued, vocabulary_entries: { ...queued.vocabulary_entries, senses: nextSenses, translation: nextTranslation } }
          : queued))
      }
    }

    // The verdict flips either way: an answer the checker already knew is simply right.
    setResult('correct')
    setAcceptingAnswer(false)
  }

  async function rate(rating: number) {
    if (!current) return
    setRatingLoading(true)
    const res = await fetch('/api/review/rate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardId: current.id, rating, answerResult: result, answerText: answer.trim() || null }),
    })
    const body = await res.json().catch(() => ({}))

    if (res.ok && body.logId) {
      setHistory((previous) => [...previous, {
        item: current,
        mode,
        answer,
        result,
        revealedWithoutAnswer,
        rating,
        logId: body.logId,
        sentence,
        sentenceTranslation,
      }])

      if (rating === 1 && body.card) {
        setItems((queue) => insertAgainRandomly(queue.slice(1), patchReviewItem(current, body.card, body.status)))
      } else {
        setItems((queue) => queue.slice(1))
        setCompleted((value) => value + 1)
      }

      setAnswer('')
      setRevealed(false)
      setResult(null)
      setRevealedWithoutAnswer(false)
      setFreshSentence(null)
    }
    setRatingLoading(false)
  }

  function applyRevisedRating(historyItem: ReviewedItem, oldRating: number, newRating: number, card: CardPatch, status: LearningStatus) {
    setHistory((currentHistory) => currentHistory.map((item) => item.logId === historyItem.logId ? { ...item, rating: newRating } : item))

    if (oldRating !== 1 && newRating === 1) {
      setCompleted((value) => Math.max(0, value - 1))
      setItems((queue) => insertAgainRandomly(queue, patchReviewItem(historyItem.item, card, status)))
    } else if (oldRating === 1 && newRating !== 1) {
      setCompleted((value) => value + 1)
      setItems((queue) => queue.filter((item) => item.id !== historyItem.item.id))
    }
  }

  const total = initialItems.length
  const progress = total ? Math.min(100, Math.round(completed / total * 100)) : 100

  if (historyIndex !== null && history[historyIndex]) {
    const reviewed = history[historyIndex]
    return <ReviewedCard
      reviewed={reviewed}
      index={historyIndex}
      count={history.length}
      languageLabel={languageLabel}
      onPrevious={() => setHistoryIndex((index) => index === null ? null : Math.max(0, index - 1))}
      onNext={() => setHistoryIndex((index) => index === null || index >= history.length - 1 ? null : index + 1)}
      onRatingChanged={(oldRating, newRating, card, status) => applyRevisedRating(reviewed, oldRating, newRating, card, status)}
    />
  }

  if (!current || !entry) {
    return <section className="review-complete">
      <div className="success-burst review-success-burst"><Sparkles size={38}/></div>
      <span className="eyebrow">SESSION COMPLETE</span>
      <h1>Nothing else is due.</h1>
      <p>{completed ? `You cleared ${completed} ${completed === 1 ? 'review' : 'reviews'}.` : 'Your memory queue is clear.'} Come back when FSRS asks for you again.</p>
      <div className="complete-stats"><span><Check size={18}/><strong>{completed}</strong> reviewed</span><span><Target size={18}/><strong>100%</strong> queue cleared</span><span><span className="review-fire-wrap"><Flame className="review-fire" size={18}/></span><strong>+1</strong> study day</span></div>
      {history.length > 0 && <button className="soft-button" style={{ marginTop: 18 }} onClick={() => setHistoryIndex(history.length - 1)}><ArrowLeft size={16}/> Review previous</button>}
    </section>
  }

  return <>
    <header className="review-header">
      <div>
        <span className="eyebrow">FOCUS MODE</span>
        <h1>Review session</h1>
        {history.length > 0 && <button className="soft-button" style={{ marginTop: 8, padding: '7px 10px' }} onClick={() => setHistoryIndex(history.length - 1)}><ArrowLeft size={14}/> Previous answer</button>}
      </div>
      <div className="review-progress-wrap"><span>{completed} / {total}</span><div className="review-progress review-progress-live"><i style={{ width: `${progress}%` }}/></div></div>
    </header>

    <section key={current.id} className={`flash-card review-card-live ${revealed ? 'revealed' : ''}`}>
      <div className="card-topline">
        <span className="prompt-type">
          {mode === 'recognition'
            ? `Danish ${entryKind === 'sentence' ? 'sentence' : ''} → ${languageLabel}`
            : mode === 'production'
              ? `${languageLabel} → Danish`
              : 'Fill the Danish word'}
        </span>
        <span className="card-meta">
          <MemoryRing item={current} />
          <span className="card-status">{entryKind === 'sentence' ? 'sentence' : entry.learning_status}</span>
        </span>
      </div>

      <div className="flash-prompt">
        <ReviewPromptReveal
          key={`${current.id}:${current.reps}:${mode}:${prompt}`}
          text={prompt}
          cloze={mode === 'cloze' && !!sentence}
        />
        {revealed && entry.pronunciation && <span className="pronunciation review-pronunciation">{entry.pronunciation}</span>}
        {mode === 'cloze' && sentenceTranslation && <small>{sentenceTranslation}</small>}
      </div>

      <form onSubmit={submitAnswer} className="answer-form">
        <label>Your answer</label>
        <div className={`answer-input-wrap ${revealed ? result || '' : ''}`}>
          <input
            autoFocus
            disabled={revealed || checkingMeaning}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder={mode === 'recognition' ? `Type the ${languageLabel} meaning…` : entryKind === 'sentence' ? 'Type the Danish sentence…' : 'Type the Danish word…'}
          />
          {revealed && (result === 'incorrect' ? <X size={20}/> : <Check size={20}/>)}
        </div>
        {!revealed && <button disabled={checkingMeaning} className="primary-button answer-submit">{checkingMeaning ? 'Checking meaning…' : answer.trim() ? 'Check answer' : 'Show answer'} {!checkingMeaning && <ArrowRight size={17}/>}</button>}
      </form>

      {revealed && <div className="answer-reveal">
        <div className={`answer-verdict ${result}`}>
          <strong>{revealedWithoutAnswer ? "Didn't know" : result === 'correct' ? 'Correct' : result === 'mostly' ? 'Almost right' : 'Not quite'}</strong>
          {revealedWithoutAnswer
            ? <span>The answer is shown below. “Again” is recommended.</span>
            : result === 'mostly' && <span>The meaning is close enough, but notice the difference.</span>}
        </div>

        <div className="correct-answer">
          <span>Correct answer</span>
          <strong>{expected}</strong>
          {entryKind !== 'sentence' && mode !== 'cloze' && entry.example_sentence && <p>{entry.example_sentence}<small>{entry.example_translation}</small></p>}
        </div>

        {/* Only in recognition: there the typed answer is a meaning, which is what a sense is.
            In production the answer is Danish, and storing it as a meaning would be wrong. */}
        {mode === 'recognition' && !revealedWithoutAnswer && answer.trim() && result !== 'correct' && (
          <button
            type="button"
            className="soft-button accept-answer-button"
            disabled={acceptingAnswer || ratingLoading}
            onClick={() => void acceptTypedAnswer()}
          >
            {acceptingAnswer ? <Loader2 className="spin" size={15} /> : <ThumbsUp size={15} />}
            My answer was right
          </button>
        )}

        <div className="rating-title"><span>How well did you remember it?</span><small>You decide. This controls FSRS.</small></div>
        <div className="rating-grid review-rating-grid">{ratings.map((r) => <button disabled={ratingLoading} key={r.value} onClick={() => rate(r.value)} className={`rating-button ${r.cls} ${suggestedRating(result) === r.value ? 'suggested' : ''}`}><strong>{r.label}</strong><span>{r.hint}</span></button>)}</div>
      </div>}
    </section>

    <div className="review-tip">
      <RotateCcw size={15}/>
      {entryKind === 'sentence'
        ? 'Sentences are comprehension-first, with occasional reverse recall.'
        : 'Synonyms are checked by meaning. “Again” cards return later in this session.'}
    </div>
  </>
}

function ReviewedCard({ reviewed, index, count, languageLabel, onPrevious, onNext, onRatingChanged }: {
  reviewed: ReviewedItem
  index: number
  count: number
  languageLabel: string
  onPrevious: () => void
  onNext: () => void
  onRatingChanged: (oldRating: number, newRating: number, card: CardPatch, status: LearningStatus) => void
}) {
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const entry = reviewed.item.vocabulary_entries
  const entryKind = entry.entry_kind || 'word'
  const mode = reviewed.mode
  const expected = mode === 'recognition' ? entry.translation || '' : entry.danish
  const prompt = mode === 'recognition'
    ? entry.danish
    : mode === 'production'
      ? entry.translation || ''
      : reviewed.sentence ? clozeSentence(reviewed.sentence, entry.danish) : entry.translation || ''

  async function reviseRating(newRating: number) {
    if (newRating === reviewed.rating || loading) return
    const oldRating = reviewed.rating
    setLoading(true)
    setNotice(null)
    const res = await fetch('/api/review/revise', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        logId: reviewed.logId,
        rating: newRating,
        answerResult: reviewed.result,
        answerText: reviewed.answer.trim() || null,
      }),
    })
    const body = await res.json().catch(() => ({}))
    if (res.ok && body.card) {
      onRatingChanged(oldRating, newRating, body.card, body.status)
      setNotice(`Changed to ${ratings.find((rating) => rating.value === newRating)?.label || newRating}.`)
    } else {
      setNotice(body.error || 'Could not revise this rating.')
    }
    setLoading(false)
  }

  return <>
    <header className="review-header">
      <div><span className="eyebrow">REVIEW HISTORY</span><h1>Previous answer</h1></div>
      <div className="review-progress-wrap"><span>{index + 1} / {count}</span></div>
    </header>

    <section className="flash-card revealed">
      <div className="card-topline">
        <span className="prompt-type">{mode === 'recognition' ? `Danish → ${languageLabel}` : mode === 'production' ? `${languageLabel} → Danish` : 'Fill the Danish word'}</span>
        <span className="card-status">answered</span>
      </div>

      <div className="flash-prompt">
        {mode === 'cloze' && reviewed.sentence ? <p className="cloze-prompt">{prompt}</p> : <h2>{prompt}</h2>}
        {entry.pronunciation && <span className="pronunciation review-pronunciation">{entry.pronunciation}</span>}
      </div>

      <div className="answer-form">
        <label>Your answer</label>
        <div className={`answer-input-wrap ${reviewed.result || 'incorrect'}`}>
          <input disabled value={reviewed.answer} placeholder={reviewed.revealedWithoutAnswer ? 'No answer entered' : ''} readOnly />
          {reviewed.result === 'incorrect' ? <X size={20}/> : <Check size={20}/>} 
        </div>
      </div>

      <div className="answer-reveal">
        <div className={`answer-verdict ${reviewed.result || 'incorrect'}`}>
          <strong>{reviewed.revealedWithoutAnswer ? "Didn't know" : reviewed.result === 'correct' ? 'Correct' : reviewed.result === 'mostly' ? 'Almost right' : 'Not quite'}</strong>
        </div>
        <div className="correct-answer"><span>Correct answer</span><strong>{expected}</strong></div>
        <div className="rating-title"><span>Change your rating if needed</span><small>The FSRS schedule is recalculated from the original review state.</small></div>
        <div className="rating-grid">{ratings.map((rating) => <button
          disabled={loading}
          key={rating.value}
          onClick={() => reviseRating(rating.value)}
          className={`rating-button ${rating.cls}`}
          style={reviewed.rating === rating.value ? { boxShadow: '0 0 0 2px #7657d6 inset' } : undefined}
        ><strong>{rating.label}</strong><span>{rating.hint}</span></button>)}</div>
        {notice && <small style={{ display: 'block', marginTop: 10, color: '#7c7485' }}>{notice}</small>}
      </div>
    </section>

    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 14 }}>
      <button className="soft-button" disabled={index === 0} onClick={onPrevious}><ArrowLeft size={15}/> Older</button>
      <button className="soft-button" onClick={onNext}>{index === count - 1 ? 'Back to current' : 'Newer'} <ArrowRight size={15}/></button>
    </div>
  </>
}

function patchReviewItem(item: ReviewItem, card: CardPatch, status: LearningStatus): ReviewItem {
  return {
    ...item,
    ...card,
    vocabulary_entries: {
      ...item.vocabulary_entries,
      learning_status: status,
    },
  }
}

function insertAgainRandomly(queue: ReviewItem[], item: ReviewItem): ReviewItem[] {
  const withoutDuplicate = queue.filter((queued) => queued.id !== item.id)
  if (!withoutDuplicate.length) return [item]
  const insertionIndex = 1 + Math.floor(Math.random() * withoutDuplicate.length)
  const next = [...withoutDuplicate]
  next.splice(insertionIndex, 0, item)
  return next
}

function suggestedRating(result: AnswerResult | null) {
  if (result === 'correct') return 3
  if (result === 'mostly') return 2
  return 1
}
