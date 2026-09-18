const LETTER = /\p{Letter}/u
const CYRILLIC_LETTER = /\p{Script_Extensions=Cyrillic}/u

export function normalizePronunciationText(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('da-DK').replace(/\s+/g, ' ')
}

/**
 * True only when the text has at least one letter and every letter is Cyrillic.
 *
 * Stress marks, punctuation, spaces and digits are allowed because they are reading aids, but a
 * single Latin/Greek homoglyph fails the value. This is intentionally stricter than merely asking
 * whether the string contains Cyrillic somewhere.
 */
export function isReadableCyrillic(value: string): boolean {
  const text = value.normalize('NFKC').trim()
  if (!text) return false
  let hasLetter = false
  for (const character of text) {
    if (!LETTER.test(character)) continue
    hasLetter = true
    if (!CYRILLIC_LETTER.test(character)) return false
  }
  return hasLetter
}
