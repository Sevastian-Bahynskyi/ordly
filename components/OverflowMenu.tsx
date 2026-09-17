'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

export interface OverflowMenuItem {
  label: string
  icon?: ReactNode
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
}

/**
 * A `⋯` button with a small menu of secondary actions. Things used rarely live here so the row
 * itself stays calm; everything in it is still one tap away (HIG pull-down buttons, "More").
 */
export function OverflowMenu({ items, label, trigger, className = '', align = 'end' }: {
  items: (OverflowMenuItem | 'separator')[]
  label: string
  trigger: ReactNode
  className?: string
  align?: 'end' | 'start'
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLSpanElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    function outside(event: PointerEvent): void {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    function escape(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  const visible = items.filter((item, index) => item !== 'separator' || (index > 0 && index < items.length - 1))
  return (
    <span className="overflow-menu" ref={root}>
      <button
        type="button"
        className={className}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={(event) => { event.preventDefault(); setOpen((value) => !value) }}
      >
        {trigger}
      </button>
      {open && (
        <span className={`overflow-menu-list ${align}`} role="menu" id={id}>
          {visible.map((item, index) => item === 'separator'
            ? <hr key={`separator-${index}`} />
            : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={item.danger ? 'danger' : ''}
                disabled={item.disabled}
                onClick={(event) => { event.preventDefault(); setOpen(false); item.onSelect() }}
              >
                {item.icon}{item.label}
              </button>
            ))}
        </span>
      )}
    </span>
  )
}
