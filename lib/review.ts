export type PromptMode = 'recognition' | 'production' | 'cloze'

export function reviewMode(reps: number): PromptMode {
  const slot = reps % 10
  if (slot === 3 || slot === 6) return 'production'
  if (slot === 4 || slot === 8) return 'cloze'
  return 'recognition'
}

export function clozeSentence(sentence: string, danish: string) {
  const escaped = danish.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(escaped, 'iu')
  return sentence.replace(regex, '_____')
}
