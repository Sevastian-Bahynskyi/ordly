'use client'

import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react'

/**
 * A single-value text field that grows to show its whole content. Translations are often longer
 * than one line on a phone, and a clipped `<input>` hid the end of them. Enter does not insert a
 * line break, so it still behaves like a one-line field; Cmd/Ctrl+Enter still reaches the form.
 */
export function AutoGrowTextarea({ value, onKeyDown, className = '', ...props }: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'rows'> & { value: string }): React.JSX.Element {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    function fit(): void {
      if (!element) return
      element.style.height = 'auto'
      element.style.height = `${element.scrollHeight + element.offsetHeight - element.clientHeight}px`
    }
    fit()
    // Width changes (rotation, a sidebar collapsing) rewrap the text.
    const observer = new ResizeObserver(fit)
    observer.observe(element)
    return () => observer.disconnect()
  }, [value])

  return (
    <textarea
      {...props}
      ref={ref}
      rows={1}
      value={value}
      className={`auto-grow ${className}`.trim()}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey) event.preventDefault()
        onKeyDown?.(event)
      }}
    />
  )
}
