import Link from 'next/link'
import { BookOpenCheck, Flame, Layers3, Sparkles, Target } from 'lucide-react'
import { AppShell } from '@/components/AppShell'
import { AddWordComposer } from '@/components/AddWordComposer'
import { StatCard } from '@/components/StatCard'
import { requireUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const { supabase } = await requireUser()
  const now = new Date().toISOString()
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

  const [dueResult, wordsResult, profileResult, recentResult, newTodayResult] = await Promise.all([
    supabase.from('review_cards').select('id, reps, vocabulary_entries!inner(translation)').lte('due', now),
    supabase.from('vocabulary_entries').select('learning_status'),
    supabase.from('profiles').select('*').single(),
    supabase.from('vocabulary_entries').select('id, danish, translation, pronunciation, learning_status').order('created_at', { ascending: false }).limit(4),
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

  return (
    <AppShell>
      <div className="page-wrap dashboard-page">
        <header className="top-header">
          <div><span className="eyebrow">GOD FORMIDDAG</span><h1>Your Danish, one word at a time.</h1></div>
          <div className="streak-pill">
            <span className="streak-fire" aria-hidden="true"><Flame className="streak-flame" size={17} /></span>
            <strong>{profile?.current_streak || 0}</strong>
            <span>day streak</span>
          </div>
        </header>

        <section className="hero-grid">
          <AddWordComposer translationLanguage={profile?.default_translation_language || 'ru'} />
          <aside className="review-hero">
            <div className="review-glow" />
            <span className="eyebrow light"><Sparkles size={14} /> READY WHEN YOU ARE</span>
            <div className="review-number">{due}</div>
            <h2>{due === 1 ? 'word is due' : 'words are due'}</h2>
            <p>A short session now is worth more than a long one later.</p>
            <Link href="/review" className="review-start">Start review <BookOpenCheck size={18} /></Link>
            <div className="mini-progress"><span style={{ width: `${Math.min(100, due ? 34 : 100)}%` }} /></div>
          </aside>
        </section>

        <section className="stats-grid">
          <StatCard icon={Layers3} label="All words" value={total} detail={`${learning} learning`} />
          <StatCard icon={Target} label="Mastered" value={mastered} detail={total ? `${Math.round(mastered / total * 100)}% of collection` : 'Start with your first word'} />
          <StatCard icon={Flame} label="Current streak" value={`${profile?.current_streak || 0} days`} detail={`Best ${profile?.longest_streak || 0} days`} />
          <StatCard icon={BookOpenCheck} label="Today's new words" value={`${todayProgress}/${dailyLimit}`} detail="Reviews always come first" />
        </section>

        <section className="section-card recent-section">
          <div className="section-title-row"><div><span className="eyebrow">RECENTLY ADDED</span><h2>Fresh in your memory</h2></div><Link href="/words">See all words →</Link></div>
          <div className="recent-list">
            {recentResult.data?.length ? recentResult.data.map((word) => (
              <div className="recent-word" key={word.id}>
                <span className="word-bubble">{word.danish.slice(0, 1).toLocaleUpperCase('da-DK')}</span>
                <div><strong>{word.danish}</strong><small>{word.pronunciation || 'pronunciation not added'}</small></div>
                <span className="recent-translation">{word.translation}</span>
                <span className={`status-chip ${word.learning_status}`}>{word.learning_status}</span>
              </div>
            )) : <div className="empty-state">Your first saved word will appear here.</div>}
          </div>
        </section>
      </div>
    </AppShell>
  )
}
