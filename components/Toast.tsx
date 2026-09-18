'use client'

import { useEffect } from 'react'
import { Bot, Check, CircleAlert } from 'lucide-react'

export type ToastTone = 'info' | 'success' | 'warning' | 'error'

export interface ToastAction {
  label: string
  onAct: () => void
  disabled?: boolean
}

/**
 * A transient status message for something that already happened. It leaves on its own, so a
 * message the learner has finished reading never keeps taking up room in the form.
 *
 * An action here is a shortcut, never the only way back: the toast is gone in a few seconds,
 * so whatever it offers has to stay reachable somewhere permanent too.
 */
export function Toast({ message, tone = 'info', action, onDismiss }: {
  message: string
  tone?: ToastTone
  action?: ToastAction
  onDismiss: () => void
}): React.JSX.Element {
  // An action needs time to be noticed and tapped; a bare confirmation does not.
  const duration = action ? 8000 : tone === 'error' || tone === 'warning' ? 6000 : 3500

  // Keyed on the message so a new one restarts the clock instead of inheriting what is left
  // of the previous message's.
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, duration)
    return () => window.clearTimeout(timer)
  }, [message, tone, duration])

  const Icon = tone === 'success' ? Check : tone === 'error' || tone === 'warning' ? CircleAlert : Bot
  return (
    <div className={`toast toast-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon size={16} />
      <span>{message}</span>
      {action && (
        <button type="button" className="toast-action" disabled={action.disabled} onClick={action.onAct}>
          {action.label}
        </button>
      )}
    </div>
  )
}
