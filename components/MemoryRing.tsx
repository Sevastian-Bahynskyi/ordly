import { fsrs, type Card } from 'ts-fsrs'
import type { ReviewCard } from '@/lib/types'

const scheduler = fsrs()

type MemoryTier = 'new' | 'fragile' | 'building' | 'growing' | 'strong'

function toFsrsCard(item: ReviewCard): Card {
  return {
    due: new Date(item.due),
    stability: item.stability,
    difficulty: item.difficulty,
    elapsed_days: item.elapsed_days,
    scheduled_days: item.scheduled_days,
    reps: item.reps,
    lapses: item.lapses,
    learning_steps: item.learning_steps,
    state: item.state as Card['state'],
    last_review: item.last_review ? new Date(item.last_review) : undefined,
  }
}

function recallPercent(item: ReviewCard) {
  if (item.state === 0 || !item.last_review) return 0

  try {
    const retrievability = scheduler.get_retrievability(toFsrsCard(item), new Date(), false)
    return Math.round(Math.max(0, Math.min(1, retrievability)) * 100)
  } catch {
    return 0
  }
}

function stabilityLabel(days: number) {
  if (!Number.isFinite(days) || days <= 0) return '0d'
  if (days < 1) return `${Math.max(1, Math.round(days * 24))}h`
  if (days < 30) return `${Math.round(days)}d`
  if (days < 365) return `${Math.round(days / 30)}mo`
  return `${(days / 365).toFixed(1)}y`
}

function memoryTier(item: ReviewCard): MemoryTier {
  if (item.state === 0 || !item.last_review) return 'new'
  if (item.stability < 1) return 'fragile'
  if (item.stability < 7) return 'building'
  if (item.stability < 30) return 'growing'
  return 'strong'
}

function tierLabel(tier: MemoryTier) {
  if (tier === 'new') return 'New'
  if (tier === 'fragile') return 'Fragile'
  if (tier === 'building') return 'Building'
  if (tier === 'growing') return 'Growing'
  return 'Strong'
}

function nextReviewLabel(dueValue: string) {
  const due = new Date(dueValue)
  if (Number.isNaN(due.getTime())) return 'Not scheduled'

  const deltaMs = due.getTime() - Date.now()
  let relative = 'Due now'

  if (deltaMs > 0) {
    const minutes = Math.ceil(deltaMs / 60_000)
    if (minutes < 90) relative = `in ${minutes}m`
    else {
      const hours = Math.ceil(deltaMs / 3_600_000)
      if (hours < 48) relative = `in ${hours}h`
      else {
        const days = Math.ceil(deltaMs / 86_400_000)
        relative = days < 14 ? `in ${days}d` : ''
      }
    }
  }

  const exact = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Copenhagen',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(due)

  return relative ? `${relative} · ${exact}` : exact
}

export function MemoryRing({ item, compact = false }: { item: ReviewCard; compact?: boolean }) {
  const isNew = item.state === 0 || !item.last_review
  const recall = recallPercent(item)
  const tier = memoryTier(item)
  const tierName = tierLabel(tier)
  const nextReview = nextReviewLabel(item.due)
  const aria = isNew
    ? `New memory. Next review ${nextReview}.`
    : `Estimated recall ${recall} percent. ${tierName} memory with stability ${stabilityLabel(item.stability)}. Next review ${nextReview}.`

  return (
    <span
      className={`memory-stat tier-${tier}${compact ? ' compact' : ''}`}
      tabIndex={0}
      aria-label={aria}
    >
      <span className="memory-ring-wrap" aria-hidden="true">
        <svg viewBox="0 0 36 36" className="memory-ring-svg">
          <circle className="memory-ring-track" cx="18" cy="18" r="14" />
          <circle
            className="memory-ring-value"
            cx="18"
            cy="18"
            r="14"
            pathLength="100"
            strokeDasharray={`${isNew ? 0 : recall} 100`}
          />
        </svg>
      </span>
      <span className="memory-stat-copy">
        <strong>{isNew ? 'New' : `${recall}%`}</strong>
        <small>{isNew ? 'memory' : 'recall'}</small>
      </span>
      <span className="memory-tooltip" role="tooltip">
        <strong>{isNew ? 'New memory' : `${recall}% recall now`}</strong>
        <span><i className="memory-tier-dot" />{tierName} · stability {stabilityLabel(item.stability)}</span>
        <span>Next review <b>{nextReview}</b></span>
      </span>
    </span>
  )
}
