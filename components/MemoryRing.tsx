'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { JSX } from 'react'
import { fsrs, type Card } from 'ts-fsrs'
import type { Messages } from '@/lib/i18n'
import { LEARNER_LANGUAGE_LOCALES } from '@/lib/learner-language'
import type { ReviewCard, TranslationLanguage } from '@/lib/types'
import { useI18n } from './I18nProvider'

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

function stabilityLabel(t: Messages, days: number): string {
  const unit = t.memory.units
  if (!Number.isFinite(days) || days <= 0) return `0${unit.days}`
  if (days < 1) return `${Math.max(1, Math.round(days * 24))}${unit.hours}`
  if (days < 30) return `${Math.round(days)}${unit.days}`
  if (days < 365) return `${Math.round(days / 30)}${unit.months}`
  return `${(days / 365).toFixed(1)}${unit.years}`
}

function memoryTier(item: ReviewCard): MemoryTier {
  if (item.state === 0 || !item.last_review) return 'new'
  if (item.stability < 1) return 'fragile'
  if (item.stability < 7) return 'building'
  if (item.stability < 30) return 'growing'
  return 'strong'
}

function nextReviewLabel(t: Messages, language: TranslationLanguage, dueValue: string): string {
  const due = new Date(dueValue)
  if (Number.isNaN(due.getTime())) return t.memory.notScheduled

  const deltaMs = due.getTime() - Date.now()
  let relative = t.memory.dueNow

  if (deltaMs > 0) {
    const minutes = Math.ceil(deltaMs / 60_000)
    if (minutes < 90) relative = t.memory.inMinutes(minutes)
    else {
      const hours = Math.ceil(deltaMs / 3_600_000)
      if (hours < 48) relative = t.memory.inHours(hours)
      else {
        const days = Math.ceil(deltaMs / 86_400_000)
        relative = days < 14 ? t.memory.inDays(days) : ''
      }
    }
  }

  const exact = new Intl.DateTimeFormat(LEARNER_LANGUAGE_LOCALES[language], {
    timeZone: 'Europe/Copenhagen',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(due)

  return relative ? `${relative} · ${exact}` : exact
}

export function MemoryRing({ item, compact = false, placement = 'bottom' }: { item: ReviewCard; compact?: boolean; placement?: 'top' | 'bottom' }): JSX.Element {
  const { t, language } = useI18n()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [position, setPosition] = useState<{ top: number; right: number; above: boolean } | null>(null)
  const tooltipId = useId()
  const isNew = item.state === 0 || !item.last_review
  const recall = recallPercent(item)
  const tier = memoryTier(item)
  const tierName = t.memory.tiers[tier]
  const nextReview = nextReviewLabel(t, language, item.due)
  const stability = stabilityLabel(t, item.stability)
  const aria = isNew ? t.memory.newAria(nextReview) : t.memory.aria(recall, tierName, stability, nextReview)

  useEffect(() => {
    if (!position) return
    const dismiss = (event: PointerEvent): void => {
      if (!buttonRef.current?.contains(event.target as Node)) setPosition(null)
    }
    const close = (): void => setPosition(null)
    const onKeyDown = (event: KeyboardEvent): void => { if (event.key === 'Escape') close() }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [position])

  const toggle = (): void => {
    if (position) { setPosition(null); return }
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    const above = (placement === 'top' && rect.top >= 104) || rect.bottom > window.innerHeight - 130
    setPosition({
      top: above ? Math.max(12, rect.top - 102) : rect.bottom + 8,
      right: Math.max(12, window.innerWidth - rect.right),
      above,
    })
  }

  return (
    <>
    <button
      ref={buttonRef}
      type="button"
      className={`memory-stat tier-${tier}${compact ? ' compact' : ''}`}
      aria-label={t.memory.progressAria(aria)}
      aria-expanded={position !== null}
      aria-describedby={position ? tooltipId : undefined}
      onClick={toggle}
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
        <strong>{isNew ? t.memory.newShort : `${recall}%`}</strong>
        <small>{isNew ? t.memory.memoryWord : t.memory.recallWord}</small>
      </span>
    </button>
    {position && createPortal(<span id={tooltipId} className={`memory-tooltip tier-${tier}${position.above ? ' above' : ''}`} role="tooltip" style={{ top: position.top, right: position.right }}>
        <strong>{isNew ? t.memory.newMemory : t.memory.recallNow(recall)}</strong>
        <span>{t.memory.basedOn}</span>
        <span><i className="memory-tier-dot" />{t.memory.stability(tierName, stability)}</span>
        <span>{t.memory.nextReview} <b>{nextReview}</b></span>
      </span>, document.body)}
    </>
  )
}
