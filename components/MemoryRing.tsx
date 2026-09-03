import { fsrs, type Card } from 'ts-fsrs'
import type { ReviewItem } from '@/lib/types'

const scheduler = fsrs()

function toFsrsCard(item: ReviewItem): Card {
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

function recallPercent(item: ReviewItem) {
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

export function MemoryRing({ item }: { item: ReviewItem }) {
  const isNew = item.state === 0 || !item.last_review
  const recall = recallPercent(item)
  const title = isNew
    ? 'New memory · not reviewed yet'
    : `Estimated recall ${recall}% · stability ${stabilityLabel(item.stability)}`

  return (
    <span className="memory-stat" title={title} aria-label={title}>
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
    </span>
  )
}
