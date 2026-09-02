'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, Flame, RotateCcw, Sparkles, Target, X } from 'lucide-react'
import type { ReviewItem } from '@/lib/types'
import { checkAnswer, type AnswerResult } from '@/lib/answer'
import { clozeSentence, reviewMode } from '@/lib/review'

const ratings = [
  { value: 1, label: 'Again', hint: '< 1m', cls: 'again' },
  { value: 2, label: 'Hard', hint: 'soon', cls: 'hard' },
  { value: 3, label: 'Good', hint: 'later', cls: 'good' },
  { value: 4, label: 'Easy', hint: 'much later', cls: 'easy' },
]

export function ReviewSession({ initialItems, translationLanguage = 'ru' }: { initialItems: ReviewItem[]; translationLanguage?: 'ru' | 'en' | 'uk' }) {
  const languageLabel = translationLanguage === 'ru' ? 'Russian' : translationLanguage === 'uk' ? 'Ukrainian' : 'English'
  const [items, setItems] = useState(initialItems)
  const [answer, setAnswer] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [result, setResult] = useState<AnswerResult | null>(null)
  const [completed, setCompleted] = useState(0)
  const [freshSentence, setFreshSentence] = useState<{ sentence: string; translation: string } | null>(null)
  const [ratingLoading, setRatingLoading] = useState(false)
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

  function submitAnswer(e: React.FormEvent) {
    e.preventDefault()
    if (!answer.trim()) return
    setResult(checkAnswer(answer, expected))
    setRevealed(true)
  }

  async function rate(rating: number) {
    if (!current) return
    setRatingLoading(true)
    const res = await fetch('/api/review/rate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardId: current.id, rating, answerResult: result }),
    })

    if (res.ok) {
      setItems((x) => x.slice(1))
      setCompleted((x) => x + 1)
      setAnswer('')
      setRevealed(false)
      setResult(null)
      setFreshSentence(null)
    }
    setRatingLoading(false)
  }

  const total = initialItems.length
  const progress = total ? Math.round(completed / total * 100) : 100

  if (!current || !entry) {
    return <section className="review-complete"><div className="success-burst"><Sparkles size={38}/></div><span className="eyebrow">SESSION COMPLETE</span><h1>Nothing else is due.</h1><p>{completed ? `You cleared ${completed} ${completed === 1 ? 'review' : 'reviews'}.` : 'Your memory queue is clear.'} Come back when FSRS asks for you again.</p><div className="complete-stats"><span><Check size={18}/><strong>{completed}</strong> reviewed</span><span><Target size={18}/><strong>100%</strong> queue cleared</span><span><Flame size={18}/><strong>+1</strong> study day</span></div></section>
  }

  return <>
    <header className="review-header"><div><span className="eyebrow">FOCUS MODE</span><h1>Review session</h1></div><div className="review-progress-wrap"><span>{completed} / {total}</span><div className="review-progress"><i style={{ width: `${progress}%` }}/></div></div></header>
    <section className={`flash-card ${revealed ? 'revealed' : ''}`}>
      <div className="card-topline">
        <span className="prompt-type">
          {mode === 'recognition'
            ? `Danish ${entryKind === 'sentence' ? 'sentence' : ''} → ${languageLabel}`
            : mode === 'production'
              ? `${languageLabel} → Danish`
              : 'Fill the Danish word'}
        </span>
        <span className="card-status">{entryKind === 'sentence' ? 'sentence' : entry.learning_status}</span>
      </div>

      <div className="flash-prompt">
        {mode === 'cloze' && sentence ? <p className="cloze-prompt">{prompt}</p> : <h2>{prompt}</h2>}
        {mode === 'recognition' && entry.pronunciation && <span className="pronunciation">{entry.pronunciation}</span>}
        {mode === 'cloze' && sentenceTranslation && <small>{sentenceTranslation}</small>}
      </div>

      <form onSubmit={submitAnswer} className="answer-form">
        <label>Your answer</label>
        <div className={`answer-input-wrap ${revealed ? result || '' : ''}`}>
          <input
            autoFocus
            disabled={revealed}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder={mode === 'recognition' ? `Type the ${languageLabel} meaning…` : entryKind === 'sentence' ? 'Type the Danish sentence…' : 'Type the Danish word…'}
          />
          {revealed && (result === 'incorrect' ? <X size={20}/> : <Check size={20}/>)}
        </div>
        {!revealed && <button className="primary-button answer-submit">Check answer <ArrowRight size={17}/></button>}
      </form>

      {revealed && <div className="answer-reveal">
        <div className={`answer-verdict ${result}`}>
          <strong>{result === 'correct' ? 'Correct' : result === 'mostly' ? 'Almost right' : 'Not quite'}</strong>
          {result === 'mostly' && <span>Close enough for recognition, but notice the difference.</span>}
        </div>

        <div className="correct-answer">
          <span>Correct answer</span>
          <strong>{expected}</strong>
          {entryKind !== 'sentence' && mode !== 'cloze' && entry.example_sentence && <p>{entry.example_sentence}<small>{entry.example_translation}</small></p>}
        </div>

        <div className="rating-title"><span>How well did you remember it?</span><small>You decide. This controls FSRS.</small></div>
        <div className="rating-grid">{ratings.map((r) => <button disabled={ratingLoading} key={r.value} onClick={() => rate(r.value)} className={`rating-button ${r.cls} ${suggestedRating(result) === r.value ? 'suggested' : ''}`}><strong>{r.label}</strong><span>{r.hint}</span></button>)}</div>
      </div>}
    </section>

    <div className="review-tip">
      <RotateCcw size={15}/>
      {entryKind === 'sentence'
        ? 'Sentences are comprehension-first, with occasional reverse recall.'
        : 'Sentences rotate over time so you learn the word, not one memorized example.'}
    </div>
  </>
}

function suggestedRating(result: AnswerResult | null) {
  if (result === 'correct') return 3
  if (result === 'mostly') return 2
  return 1
}
