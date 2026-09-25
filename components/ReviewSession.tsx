'use client'

import { DEFAULT_LEARNER_LANGUAGE, LEARNER_LANGUAGE_NAMES } from '@/lib/learner-language'
import type { Messages } from '@/lib/i18n'
import { useI18n } from '@/components/I18nProvider'
import { useState } from 'react'
import Link from 'next/link'
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
import { MemoryRing } from '@/components/MemoryRing'
import { ReviewPromptReveal } from '@/components/ReviewPromptReveal'
import { FormBranch } from '@/components/FormBranch'
import type { WordForm } from '@/lib/word-forms'
import { WordAudio } from '@/components/WordAudio'
import { inferDanishInputKind } from '@/lib/entry-kind'

const ratings = [
  { value: 1, cls: 'again' },
  { value: 2, cls: 'hard' },
  { value: 3, cls: 'good' },
  { value: 4, cls: 'easy' },
] as const

type CardPatch = Pick<ReviewItem, 'due' | 'stability' | 'difficulty' | 'elapsed_days' | 'scheduled_days' | 'reps' | 'lapses' | 'learning_steps' | 'state' | 'last_review'>
type AnswerRelation = 'exact' | 'valid_alternative' | 'near' | 'incorrect'
type AnswerFeedback = { relation: AnswerRelation; note: string }

type ReviewedItem = {
  item: ReviewItem
  answer: string
  result: AnswerResult | null
  feedback: AnswerFeedback | null
  revealedWithoutAnswer: boolean
  rating: number
  logId: string | number
}

export function ReviewSession({ initialItems, formsByEntry = {}, translationLanguage = DEFAULT_LEARNER_LANGUAGE, autoplayAudio = false }: {
  initialItems: ReviewItem[]
  formsByEntry?: Record<string, WordForm[]>
  translationLanguage?: 'ru' | 'en' | 'uk'
  autoplayAudio?: boolean
}): React.JSX.Element {
  const { t } = useI18n()
  // The interface names the language in its own words; the AI checker is told it in English.
  const languageLabel = t.languageNames[translationLanguage]
  const reviewItems = initialItems.filter((item) => item.vocabulary_entries.entry_kind !== 'sentence')
  const [items, setItems] = useState(reviewItems)
  const [answer, setAnswer] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [result, setResult] = useState<AnswerResult | null>(null)
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null)
  const [revealedWithoutAnswer, setRevealedWithoutAnswer] = useState(false)
  const [completed, setCompleted] = useState(0)
  const [ratingLoading, setRatingLoading] = useState(false)
  const [checkingMeaning, setCheckingMeaning] = useState(false)
  const [acceptingAnswer, setAcceptingAnswer] = useState(false)
  const [history, setHistory] = useState<ReviewedItem[]>([])
  const [historyIndex, setHistoryIndex] = useState<number | null>(null)

  const current = items[0]
  const entry = current?.vocabulary_entries
  const expected = entry?.translation || ''
  const prompt = entry?.danish || ''

  async function submitAnswer(e: React.FormEvent) {
    e.preventDefault()
    const typedAnswer = answer.trim()

    if (!typedAnswer) {
      setResult('incorrect')
      setFeedback(null)
      setRevealedWithoutAnswer(true)
      setRevealed(true)
      return
    }

    const senses = entrySenses(entry)
    const quickResult = checkAnswer(typedAnswer, expected, {
      meaning: true,
      senses,
    })
    if (quickResult !== 'incorrect') {
      setResult(quickResult)
      setFeedback(quickResult === 'mostly'
          ? { relation: 'near', note: t.review.near }
          : { relation: 'exact', note: t.review.exact })
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
          mode: 'recognition',
          language: LEARNER_LANGUAGE_NAMES[translationLanguage],
        }),
      })
      if (res.ok) {
        const body = await res.json()
        if (body.result === 'correct' || body.result === 'mostly' || body.result === 'incorrect') {
          finalResult = body.result
          if (['valid_alternative', 'near', 'incorrect'].includes(body.relation) && typeof body.note === 'string') {
            setFeedback({ relation: body.relation, note: body.note })
          }
        }
      }
    } catch {
      // Keep the deterministic result if AI semantic checking is unavailable.
    }
    setCheckingMeaning(false)
    setResult(finalResult)
    if (finalResult === 'incorrect') setFeedback((value) => value || { relation: 'incorrect', note: t.review.notSaved })
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
      : splitTranslationIntoSenses(entry.translation, 'word')
    const typedKey = normalizeSenseText(typed)
    const known = activeSenses(base).some((sense) => normalizeSenseText(sense.text) === typedKey)
    let saved = known

    if (!known && typedKey) {
      const nextSenses = [...base, createSense(typed, { source: 'user' })]
      const { error } = await createClient()
        .from('vocabulary_entries')
        .update({ senses: nextSenses })
        .eq('id', entry.id)

      if (!error) {
        saved = true
        const nextTranslation = translationFromSenses(nextSenses)
        setItems((queue) => queue.map((queued) => queued.entry_id === entry.id
          ? { ...queued, vocabulary_entries: { ...queued.vocabulary_entries, senses: nextSenses, translation: nextTranslation } }
          : queued))
      }
    }

    // The verdict flips either way: an answer the checker already knew is simply right.
    setResult('correct')
    setFeedback({
      relation: 'valid_alternative',
      note: saved ? t.review.acceptedSaved : t.review.acceptedOnce,
    })
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
        answer,
        result,
        feedback,
        revealedWithoutAnswer,
        rating,
        logId: body.logId,
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
      setFeedback(null)
      setRevealedWithoutAnswer(false)
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

  const total = reviewItems.length
  const progress = total ? Math.min(100, Math.round(completed / total * 100)) : 100

  if (historyIndex !== null && history[historyIndex]) {
    const reviewed = history[historyIndex]
    return <div className="review-zen-active">
      <ReviewZenBar progressLabel={`${historyIndex + 1} / ${history.length}`} />
      <ReviewedCard
        reviewed={reviewed}
        index={historyIndex}
        count={history.length}
        languageLabel={languageLabel}
        autoplayAudio={autoplayAudio}
        forms={formsByEntry[reviewed.item.entry_id] || []}
        onPrevious={() => setHistoryIndex((index) => index === null ? null : Math.max(0, index - 1))}
        onNext={() => setHistoryIndex((index) => index === null || index >= history.length - 1 ? null : index + 1)}
        onRatingChanged={(oldRating, newRating, card, status) => applyRevisedRating(reviewed, oldRating, newRating, card, status)}
      />
    </div>
  }

  if (!current || !entry) {
    return <section className="review-complete">
      <div className="success-burst review-success-burst"><Sparkles size={38}/></div>
      <span className="eyebrow">{t.review.completeEyebrow}</span>
      <h1>{t.review.completeTitle}</h1>
      <p>{completed ? t.review.cleared(completed) : t.review.queueClear} {t.review.comeBack}</p>
      <div className="complete-stats"><span><Check size={18}/><strong>{completed}</strong> {t.review.reviewed}</span><span><Target size={18}/><strong>100%</strong> {t.review.queueCleared}</span><span><span className="review-fire-wrap"><Flame className="review-fire" size={18}/></span><strong>+1</strong> {t.review.studyDay}</span></div>
      {history.length > 0 && <button className="soft-button" style={{ marginTop: 18 }} onClick={() => setHistoryIndex(history.length - 1)}><ArrowLeft size={16}/> {t.review.reviewPrevious}</button>}
    </section>
  }

  return <div className="review-zen-active">
    <ReviewZenBar progressLabel={`${completed} / ${total}`} progress={progress} />
    {history.length > 0 && <button className="review-previous-button" onClick={() => setHistoryIndex(history.length - 1)}><ArrowLeft size={14}/> {t.review.previousAnswer}</button>}

    <section key={current.id} className={`flash-card review-card-live ${revealed ? 'revealed' : ''}`} data-loading-label={t.review.loadingNext}>
      <div className="card-topline">
        <span className="prompt-type">
          {t.review.direction(languageLabel)}
        </span>
        <span className="card-meta">
          <MemoryRing item={current} placement="top" />
          <span className="card-status">{t.status[entry.learning_status]}</span>
        </span>
      </div>

      <div className="flash-prompt">
        <ReviewPromptReveal
          key={`${current.id}:${current.reps}:${prompt}`}
          text={prompt}
          cloze={false}
        />
        <DanishAudio entry={entry} autoPlay={autoplayAudio} />
      </div>

      <form onSubmit={submitAnswer} className="answer-form">
        <label>{t.review.yourAnswer}</label>
        <div className={`answer-input-wrap ${revealed ? result || '' : ''}`}>
          <input
            autoFocus
            disabled={revealed || checkingMeaning}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder={t.review.typeMeaning(languageLabel)}
          />
          {revealed && (result === 'incorrect' ? <X size={20}/> : <Check size={20}/>)}
        </div>
        {!revealed && <button disabled={checkingMeaning} className="primary-button answer-submit">{checkingMeaning ? t.review.checkingMeaning : answer.trim() ? t.review.checkAnswer : t.review.showAnswer} {!checkingMeaning && <ArrowRight size={17}/>}</button>}
      </form>

      {revealed && <div className="answer-reveal">
        <div className={`answer-verdict ${result}`}>
          <strong>{verdictLabel(t, result, feedback, revealedWithoutAnswer)}</strong>
          {revealedWithoutAnswer
            ? <span>{t.review.shownBelow}</span>
            : feedback?.note && <span>{feedback.note}</span>}
        </div>

        <SavedMeanings entry={entry} />
        <FormBranch forms={formsByEntry[current.entry_id] || []} headword={entry.danish} compact />

        {/* Only in recognition: there the typed answer is a meaning, which is what a sense is.
            In production the answer is Danish, and storing it as a meaning would be wrong. */}
        {!revealedWithoutAnswer && answer.trim() && result !== 'correct' && (
          <button
            type="button"
            className="soft-button accept-answer-button"
            disabled={acceptingAnswer || ratingLoading}
            onClick={() => void acceptTypedAnswer()}
          >
            {acceptingAnswer ? <Loader2 className="spin" size={15} /> : <ThumbsUp size={15} />}
            {t.review.myAnswerRight}
          </button>
        )}

        <div className="rating-title"><span>{t.review.howWell}</span><small>{t.review.youDecide}</small></div>
        <div className="rating-grid review-rating-grid">{ratings.map((r) => <button disabled={ratingLoading} key={r.value} onClick={() => rate(r.value)} className={`rating-button ${r.cls} ${suggestedRating(result) === r.value ? 'suggested' : ''}`} data-suggested-label={t.review.suggested}><strong>{t.review.ratings[r.cls]}</strong><span>{t.review.ratingHints[r.cls]}</span></button>)}</div>
      </div>}
    </section>

    <div className="review-tip">
      <RotateCcw size={15}/>
      {t.review.tip}
    </div>
  </div>
}

function ReviewZenBar({ progressLabel, progress }: { progressLabel: string; progress?: number }): React.JSX.Element {
  const { t } = useI18n()
  return <div className="review-zen-bar">
    <Link href="/" className="review-exit"><ArrowLeft size={17}/><span>{t.review.exit}</span></Link>
    <div className="review-progress-wrap" aria-label={t.review.progress(progressLabel)}>
      <span>{progressLabel}</span>
      {progress !== undefined && <div className="review-progress review-progress-live"><i style={{ width: `${progress}%` }}/></div>}
    </div>
  </div>
}

function ReviewedCard({ reviewed, index, count, languageLabel, autoplayAudio, forms, onPrevious, onNext, onRatingChanged }: {
  reviewed: ReviewedItem
  index: number
  count: number
  languageLabel: string
  autoplayAudio: boolean
  forms: WordForm[]
  onPrevious: () => void
  onNext: () => void
  onRatingChanged: (oldRating: number, newRating: number, card: CardPatch, status: LearningStatus) => void
}) {
  const { t } = useI18n()
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const entry = reviewed.item.vocabulary_entries
  const prompt = entry.danish

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
      const rated = ratings.find((rating) => rating.value === newRating)
      setNotice(t.review.changedTo(rated ? t.review.ratings[rated.cls] : String(newRating)))
    } else {
      setNotice(typeof body.error === 'string' && body.error ? body.error : t.review.couldNotRevise)
    }
    setLoading(false)
  }

  return <>
    <section className="flash-card revealed">
      <div className="card-topline">
        <span className="prompt-type">{t.review.direction(languageLabel)}</span>
        <span className="card-status">{t.review.answered}</span>
      </div>

      <div className="flash-prompt">
        <h2>{prompt}</h2>
        <DanishAudio entry={entry} autoPlay={autoplayAudio} />
      </div>

      <div className="answer-form">
        <label>{t.review.yourAnswer}</label>
        <div className={`answer-input-wrap ${reviewed.result || 'incorrect'}`}>
          <input disabled value={reviewed.answer} placeholder={reviewed.revealedWithoutAnswer ? t.review.noAnswer : ''} readOnly />
          {reviewed.result === 'incorrect' ? <X size={20}/> : <Check size={20}/>} 
        </div>
      </div>

      <div className="answer-reveal">
        <div className={`answer-verdict ${reviewed.result || 'incorrect'}`}>
          <strong>{verdictLabel(t, reviewed.result, reviewed.feedback, reviewed.revealedWithoutAnswer)}</strong>
          {reviewed.feedback?.note && <span>{reviewed.feedback.note}</span>}
        </div>
        <SavedMeanings entry={entry} />
        <FormBranch forms={forms} headword={entry.danish} compact />
        <div className="rating-title"><span>{t.review.changeRating}</span><small>{t.review.recalculated}</small></div>
        <div className="rating-grid">{ratings.map((rating) => <button
          disabled={loading}
          key={rating.value}
          onClick={() => reviseRating(rating.value)}
          className={`rating-button ${rating.cls}`}
          style={reviewed.rating === rating.value ? { boxShadow: '0 0 0 2px #7657d6 inset' } : undefined}
        ><strong>{t.review.ratings[rating.cls]}</strong><span>{t.review.ratingHints[rating.cls]}</span></button>)}</div>
        {notice && <small style={{ display: 'block', marginTop: 10, color: '#7c7485' }}>{notice}</small>}
      </div>
    </section>

    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 14 }}>
      <button className="soft-button" disabled={index === 0} onClick={onPrevious}><ArrowLeft size={15}/> {t.review.older}</button>
      <button className="soft-button" onClick={onNext}>{index === count - 1 ? t.review.backToCurrent : t.review.newer} <ArrowRight size={15}/></button>
    </div>
  </>
}

function verdictLabel(t: Messages, result: AnswerResult | null, feedback: AnswerFeedback | null, revealedWithoutAnswer: boolean): string {
  if (revealedWithoutAnswer) return t.review.didntKnow
  if (feedback?.relation === 'valid_alternative') return t.review.validAlternative
  if (result === 'correct') return t.review.correct
  if (result === 'mostly') return t.review.almost
  return t.review.notQuite
}

function SavedMeanings({ entry }: { entry: ReviewItem['vocabulary_entries'] }): React.JSX.Element {
  const { t } = useI18n()
  const senses = entrySenses(entry)
  return <div className="correct-answer review-saved-meanings">
    <span>{t.review.savedMeanings(senses.length)}</span>
    <div className="review-sense-list">
      {senses.map((sense, index) => <div className="review-sense" key={`${sense.id}-${index}`}>
        <strong>{sense.text}</strong>
        {(sense.pos || sense.gender) && <span className={`review-pos pos-${sense.pos || 'none'}`}>
          {sense.gender ? `${sense.gender} · ` : ''}{sense.pos ? t.pos[sense.pos] : t.review.meaning}
        </span>}
      </div>)}
    </div>
    {entry.example_sentence && <p lang="da">{entry.example_sentence}<small>{entry.example_translation}</small></p>}
  </div>
}

function DanishAudio({ entry, autoPlay }: { entry: ReviewItem['vocabulary_entries']; autoPlay: boolean }): React.JSX.Element | null {
  return <div className="review-word-audio">
    {entry.pronunciation && <span className="pronunciation review-pronunciation">{entry.pronunciation}</span>}
    {entry.entry_kind !== 'sentence' && inferDanishInputKind(entry.danish) !== 'sentence' && <WordAudio audioPath={entry.audio_path} label={entry.danish} autoPlay={autoPlay} />}
  </div>
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
