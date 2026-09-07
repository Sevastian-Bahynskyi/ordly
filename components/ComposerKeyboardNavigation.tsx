'use client'

import { useEffect } from 'react'

const composerFieldSelector = '.field input:not([type="checkbox"]):not([type="radio"]), .field textarea'
const typingFieldSelector = 'input, textarea, [contenteditable]:not([contenteditable="false"])'

function disableAutoCapitalization(element: Element | null) {
  if (!element?.matches(typingFieldSelector)) return
  element.setAttribute('autocapitalize', 'none')
}

function applyTypingBehavior(root: ParentNode) {
  if (root instanceof Element) disableAutoCapitalization(root)
  root.querySelectorAll(typingFieldSelector).forEach((element) => disableAutoCapitalization(element))
}

export function ComposerKeyboardNavigation() {
  useEffect(() => {
    // Mobile keyboards should always start in lowercase. This only changes the
    // keyboard hint; it never lowercases or otherwise transforms what the user types.
    applyTypingBehavior(document)

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element) applyTypingBehavior(node)
        }
      }
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })

    function handlePointerDown(event: PointerEvent) {
      if (!(event.target instanceof Element)) return
      disableAutoCapitalization(event.target.closest(typingFieldSelector))
    }

    function handleFocusIn(event: FocusEvent) {
      if (!(event.target instanceof Element)) return
      disableAutoCapitalization(event.target)
    }

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

    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('focusin', handleFocusIn, true)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      observer.disconnect()
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('focusin', handleFocusIn, true)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  return null
}
