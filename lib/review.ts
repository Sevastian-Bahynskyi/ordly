import type { EntryKind } from './types'

export type PromptMode = 'recognition' | 'production' | 'cloze'

export function reviewMode(reps: number, entryKind: EntryKind = 'word'): PromptMode {
  const slot = reps % 10

  // Full sentences are best learned comprehension-first. Reverse recall still
  // appears occasionally, but cloze generation is reserved for vocabulary cards.
  if (entryKind === 'sentence') {
    return slot === 3 || slot === 7 ? 'production' : 'recognition'
  }

  if (slot === 3 || slot === 6) return 'production'
  if (slot === 4 || slot === 8) return 'cloze'
  return 'recognition'
}

export function clozeSentence(sentence: string, danish: string): string {
  if (!danish.trim()) return ''
  const escaped = danish.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'giu')
  return regex.test(sentence) ? sentence.replace(regex, '_____') : ''
}
