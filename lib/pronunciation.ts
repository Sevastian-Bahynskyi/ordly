const LETTER = /\p{Letter}/u
const CYRILLIC_LETTER = /\p{Script_Extensions=Cyrillic}/u

export function normalizePronunciationText(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('da-DK').replace(/\s+/g, ' ')
}

/**
 * True when a pronunciation hint is readable Cyrillic and nothing else (issue #5 §2).
 *
 * 13% of the cached values had Latin letters silently mixed in — `фоклaa` with a Latin `a`,
 * `хoнклэл` with a Latin `o`, `áф-` with a Latin `á`. They are invisible on screen, they break
 * search and sort, and a Russian reader cannot tell why the word will not match.
 *
 * The rule is "every letter is Cyrillic", not "some letter is Cyrillic": stress marks,
 * punctuation, spaces and digits are reading aids and stay allowed, but a single Latin or Greek
 * homoglyph anywhere disqualifies the value. Asking only whether Cyrillic appears somewhere would
 * pass `фоклaa`, which is the exact defect this was written for.
 *
 * Applied both to what a model returns and to what comes back out of `pronunciation_cache`, so
 * an old defective row is treated as a miss rather than served forever.
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
