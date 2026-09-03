'use client'

import { useEffect } from 'react'

const composerFieldSelector = '.field input:not([type="checkbox"]):not([type="radio"]), .field textarea'

export function ComposerKeyboardNavigation() {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Enter' || event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return

      const target = event.target
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return

      const composer = target.closest('.composer-card')
      if (!composer) return

      // Keep a natural way to insert a line break while plain Enter advances the form.
      if (target instanceof HTMLTextAreaElement && event.shiftKey) return

      const fields = Array.from(
        composer.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(composerFieldSelector),
      ).filter((field) => !field.disabled && field.tabIndex !== -1 && field.offsetParent !== null)

      const currentIndex = fields.indexOf(target)
      const nextField = currentIndex >= 0 ? fields[currentIndex + 1] : undefined
      if (!nextField) return

      event.preventDefault()
      nextField.focus()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return null
}
