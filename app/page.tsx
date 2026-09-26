import { learnerLanguage } from '@/lib/learner-language'
import Link from 'next/link'
import { guidedPracticeEnabled } from '@/lib/practice-config'
import { BookOpenCheck, Flame, Layers3, Target } from 'lucide-react'
import { AppShell } from '@/components/AppShell'
import { ReviewAurora } from '@/components/ReviewAurora'
import { AddWordComposer } from '@/components/AddWordComposer'
import { StatCard } from '@/components/StatCard'
import { SenseRefinementBackfill } from '@/components/SenseRefinementBackfill'
import { requireUser } from '@/lib/auth'
import { needsRefinement } from '@/lib/sense-refinement'
import type { LearningStatus } from '@/lib/types'
import { messagesFor } from '@/lib/i18n'
import { activeSenses, parseSenses } from '@/lib/senses'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const { supabase } = await requireUser()
  const now = new Date().toISOString()
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

  const [dueResult, wordsResult, profileResult, recentResult, newTodayResult] = await Promise.all([
    supabase.from('review_cards').select('id, reps, vocabulary_entries!inner(translation)').lte('due', now),
    supabase.from('vocabulary_entries').select('learning_status'),
    supabase.from('profiles').select('*').single(),
    supabase.from('vocabulary_entries').select('id, danish, translation, pronunciation, learning_status, entry_kind, senses').order('created_at', { ascending: false }).limit(4),
    supabase.from('review_logs').select('id', { count: 'exact', head: true }).eq('study_date', today).eq('previous_state', 0),
  ])

  const statuses = wordsResult.data || []
  const total = statuses.length
  const mastered = statuses.filter((x) => x.learning_status === 'mastered').length
  const learning = statuses.filter((x) => x.learning_status === 'learning').length
  const profile = profileResult.data
  const dailyLimit = profile?.daily_new_limit || 10
  const newReviewedToday = newTodayResult.count || 0
  const remainingNewSlots = Math.max(0, dailyLimit - newReviewedToday)
  const dueCards = (dueResult.data || []).filter((card) => {
    const vocabulary = Array.isArray(card.vocabulary_entries) ? card.vocabulary_entries[0] : card.vocabulary_entries
    return !!vocabulary?.translation
  })
  const dueReviews = dueCards.filter((card) => card.reps > 0).length
  const dueNew = dueCards.filter((card) => card.reps === 0).length
  const due = dueReviews + Math.min(dueNew, remainingNewSlots)
  const todayProgress = Math.min(newReviewedToday, dailyLimit)
  const recentWords = recentResult.data || []
  const language = learnerLanguage(profile?.default_translation_language)
  const t = messagesFor(language)
  const unrefinedRecent = recentWords.filter((word) => word.entry_kind !== 'sentence' && needsRefinement(word.senses)).map((word) => word.id)

  return (
    <AppShell language={language}>
      <SenseRefinementBackfill entryIds={unrefinedRecent} />
      <div className="page-wrap dashboard-page">
        <header className="top-header">
          <div><span className="eyebrow">{t.home.eyebrow}</span><h1>{t.home.title}</h1></div>
          <div className="streak-pill">
            <span className="streak-fire" aria-hidden="true"><Flame className="streak-flame" size={17} /></span>
            <strong>{profile?.current_streak || 0}</strong>
            <span>{t.home.streak}</span>
          </div>
        </header>

        <section className="hero-grid">
          <AddWordComposer translationLanguage={language} />
          <aside className="review-hero">
            <ReviewAurora />
            <div className="review-hero-content">
              <span className="eyebrow">{t.home.queueEyebrow}</span>
              <div className="review-number">{due}</div>
              <h2>{t.home.wordsDue(due)}</h2>
              <p>{t.home.queueNote}</p>
              <Link href="/review" className="review-start">{t.home.startReview} <BookOpenCheck size={18} /></Link>
              {guidedPracticeEnabled && <Link href="/review/practice" className="home-practice-link">{t.home.practice}</Link>}
            </div>
          </aside>
        </section>

        <section className="stats-grid">
          <StatCard icon={Layers3} label={t.home.allWords} value={total} detail={t.home.learning(learning)} />
          <StatCard icon={Target} label={t.home.mastered} value={mastered} detail={total ? t.home.ofCollection(Math.round(mastered / total * 100)) : t.home.firstWord} />
          <StatCard icon={Flame} label={t.home.currentStreak} value={t.home.days(profile?.current_streak || 0)} detail={t.home.best(profile?.longest_streak || 0)} />
          <StatCard icon={BookOpenCheck} label={t.home.newToday} value={`${todayProgress}/${dailyLimit}`} detail={t.home.reviewsFirst} />
        </section>

        <section className="section-card recent-section">
          <div className="section-title-row"><div><span className="eyebrow">{t.home.recentEyebrow}</span><h2>{t.home.recentTitle}</h2></div><Link href="/words">{t.home.seeAll}</Link></div>
          <div className="recent-list">
            {recentWords.length ? recentWords.map((word) => (
              <div className="recent-word" key={word.id}>
                <span className={`word-bubble pos-${activeSenses(parseSenses(word.senses))[0]?.pos || 'none'}`}>{word.danish.slice(0, 1).toLocaleUpperCase('da-DK')}</span>
                <div><strong>{word.danish}</strong><small>{word.pronunciation || t.home.noPronunciation}</small></div>
                <span className="recent-translation">{word.translation}</span>
                <span className={`status-chip ${word.learning_status}`}>{t.status[word.learning_status as LearningStatus] ?? word.learning_status}</span>
              </div>
            )) : <div className="empty-state">{t.home.emptyRecent}</div>}
          </div>
        </section>
      </div>
    </AppShell>
  )
}
