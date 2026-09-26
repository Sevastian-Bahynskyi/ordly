import { TYPED_GAP } from './catalog-phrases'

export type EntryKind = 'word' | 'sentence'
export type DanishInputKind = 'word' | 'phrase' | 'sentence'

const sentenceStarters = new Set([
  'jeg', 'du', 'han', 'hun', 'den', 'det', 'vi', 'i', 'de', 'der',
  'hvad', 'hvem', 'hvor', 'hvornår', 'hvorfor', 'hvordan',
  'hvilken', 'hvilket', 'hvilke',
  'kan', 'skal', 'vil', 'må', 'er', 'har', 'gør', 'kommer', 'går', 'ved',
])

export function inferDanishInputKind(value: string): DanishInputKind {
  const text = value.trim()
  if (!text) return 'word'

  const words = text
    .replace(/[.,!?;:]+$/u, '')
    .split(/\s+/u)
    .filter(Boolean)

  if (/[.!?]$/u.test(text)) return 'sentence'
  if (words.length >= 6) return 'sentence'
  // A gap between words is a split phrase (`står … op`), whatever its finite verb could open.
  if (new RegExp(TYPED_GAP.source, 'u').test(text)) return 'phrase'

  const first = words[0]?.toLocaleLowerCase('da-DK') || ''
  if (words.length >= 4 && sentenceStarters.has(first)) return 'sentence'
  if (words.length > 1) return 'phrase'

  return 'word'
}

export function inferEntryKind(value: string): EntryKind {
  return inferDanishInputKind(value) === 'sentence' ? 'sentence' : 'word'
}
