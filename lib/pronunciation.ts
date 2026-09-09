export function normalizePronunciationText(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('da-DK').replace(/\s+/g, ' ')
}
