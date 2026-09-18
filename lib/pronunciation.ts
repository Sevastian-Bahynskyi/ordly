export function normalizePronunciationText(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('da-DK').replace(/\s+/g, ' ')
}

/**
 * True when a pronunciation hint is readable Cyrillic and nothing else (issue #5 §2).
 *
 * 13% of the cached values had Latin letters silently mixed in — `фоклaa` with a Latin `a`,
 * `хoнклэл` with a Latin `o`, `áф-` with a Latin `á`. They are invisible on screen, they break
 * search and sort, and a Russian reader cannot tell why the word will not match. The check is
 * deliberately blunt: any Latin-script letter at all, accented ones included, disqualifies the
 * value, because a Danish reading hint has no reason to contain one.
 *
 * Applied both to what a model returns and to what comes back out of `pronunciation_cache`, so
 * an old defective row is treated as a miss rather than served forever.
 */
export function isReadableCyrillic(value: string): boolean {
  const text = value.trim()
  if (!text) return false
  if (/\p{Script=Latin}/u.test(text)) return false
  return /\p{Script=Cyrillic}/u.test(text)
}
