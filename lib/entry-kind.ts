export type EntryKind = 'word' | 'sentence'

const sentenceStarters = new Set([
  'jeg', 'du', 'han', 'hun', 'den', 'det', 'vi', 'i', 'de', 'der',
  'hvad', 'hvem', 'hvor', 'hvornår', 'hvorfor', 'hvordan',
  'hvilken', 'hvilket', 'hvilke',
  'kan', 'skal', 'vil', 'må', 'er', 'har', 'gør', 'kommer', 'går', 'ved',
])

export function inferEntryKind(value: string): EntryKind {
  const text = value.trim()
  if (!text) return 'word'

  const words = text
    .replace(/[.,!?;:]+$/u, '')
    .split(/\s+/u)
    .filter(Boolean)

  if (/[.!?]$/u.test(text)) return 'sentence'
  if (words.length >= 6) return 'sentence'

  const first = words[0]?.toLocaleLowerCase('da-DK') || ''
  if (words.length >= 4 && sentenceStarters.has(first)) return 'sentence'

  return 'word'
}
