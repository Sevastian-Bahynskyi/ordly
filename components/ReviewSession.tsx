'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Flame, RotateCcw, Sparkles, Target, X } from 'lucide-react'
import type { LearningStatus, ReviewItem } from '@/lib/types'
import { checkAnswer, type AnswerResult } from '@/lib/answer'
import { clozeSentence, reviewMode } from '@/lib/review'
import { MemoryRing } from '@/components/MemoryRing'
import { ReviewPromptReveal } from '@/components/ReviewPromptReveal'
import { VocabularyIcon } from '@/components/VocabularyIcon'

const ratings = [
  { value: 1, label: 'Again', hint: '< 1m', cls: 'again' },
  { value: 2, label: 'Hard', hint: 'soon', cls: 'hard' },
  { value: 3, label: 'Good', hint: 'later', cls: 'good' },
  { value: 4, label: 'Easy', hint: 'much later', cls: 'easy' },
]

type CardPatch = Pick<ReviewItem, 'due' | 'stability' | 'difficulty' | 'elapsed_days' | 'scheduled_days' | 'reps' | 'lapses' | 'learning_steps' | 'state' | 'last_review'>

type ReviewedItem = {
  item: ReviewItem
  answer: string
  result: AnswerResult | null
  revealedWithoutAnswer: boolean
  rating: number
  logId: string | number
  sentence: string
  sentenceTranslation: string
}

export function ReviewSession({ initialItems, translationLanguage = 'ru' }: { initialItems: ReviewItem[]; translationLanguage?: 'ru' | 'en' | 'uk' }) {
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
  const [history, setHistory] = useState<ReviewedItem[]>([])
  const [historyIndex, setHistoryIndex] = useState<number | null>(null)

  const current = items[0]
  const entry = current?.vocabulary_entries
  const entryKind = entry?.entry_kind || 'word'
  const mode = current ? reviewMode(current.reps, entryKind) : 'recognition'

  useEffect(() => {
    setFreshSentence(null)
    if (!current || entryKind === 'sentence' || mode !== 'cloze' || current.reps < 5 || current.reps % 5 !== 0) return

    fetch('/api/ai/review-sentence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryId: current.entry_id, cycle: Math.floor(current.reps / 5) }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d?.sentence && setFreshSentence(d))
      .catch(() => {})
  }, [current?.id, current?.reps, current?.entry_id, mode, entryKind])

  const sentence = freshSentence?.sentence || entry?.example_sentence || ''
  const sentenceTranslation = freshSentence?.translation || entry?.example_translation || ''
  const expected = mode === 'recognition' ? entry?.translation || '' : entry?.danish || ''

  const prompt = useMemo(() => {
    if (!entry) return ''
    if (mode === 'recognition') return entry.danish
    if (mode === 'production') return entry.translation || ''
    return sentence ? clozeSentence(sentence, entry.danish) : entry.translation || ''
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

    const quickResult = checkAnswer(typedAnswer, expected)
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
        {revealed && entryKind !== 'sentence' && entry.icon_name && <span style={{ width: 42, height: 42, borderRadius: 14, background: '#f1edff', display: 'grid', placeItems: 'center', margin: '10px auto 0' }}><VocabularyIcon name={entry.icon_name} fallback={entry.danish.slice(0, 1).toUpperCase()} size={25} /></span>}
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
  const mode = reviewMode(reviewed.item.reps, entryKind)
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
        {entryKind !== 'sentence' && entry.icon_name && <span style={{ width: 42, height: 42, borderRadius: 14, background: '#f1edff', display: 'grid', placeItems: 'center', margin: '10px auto 0' }}><VocabularyIcon name={entry.icon_name} fallback={entry.danish.slice(0, 1).toUpperCase()} size={25} /></span>}
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
          className={`rating-button ${rating.cls}`
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
