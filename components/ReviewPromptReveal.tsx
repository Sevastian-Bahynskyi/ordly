'use client'

type ReviewPromptRevealProps = {
  text: string
  cloze?: boolean
}

export function ReviewPromptReveal({ text, cloze = false }: ReviewPromptRevealProps) {
  const compactText = text.trim()
  const revealByCharacter = compactText.length > 0 && !/\s/u.test(compactText) && Array.from(compactText).length <= 22
  const units = revealByCharacter ? Array.from(text) : text.split(/(\s+)/u).filter(Boolean)
  const animatedCount = units.filter((unit) => !/^\s+$/u.test(unit)).length
  let animatedIndex = 0

  const content = units.map((unit, index) => {
    if (/^\s+$/u.test(unit)) return <span key={`space-${index}`}>{unit}</span>

    const unitIndex = animatedIndex++
    const center = (animatedCount - 1) / 2
    const delay = revealByCharacter
      ? Math.round(Math.abs(unitIndex - center) * 34)
      : unitIndex * 56

    return (
      <span
        aria-hidden="true"
        className="review-prompt-segment"
        key={`${unit}-${index}`}
        style={{ animationDelay: `${delay}ms` }}
      >
        {unit}
      </span>
    )
  })

  if (cloze) {
    return <p className="cloze-prompt review-prompt-reveal review-prompt-words" aria-label={text}>{content}</p>
  }

  return (
    <h2
      className={`review-prompt-reveal ${revealByCharacter ? 'review-prompt-characters' : 'review-prompt-words'}`}
      aria-label={text}
    >
      {content}
    </h2>
  )
}
