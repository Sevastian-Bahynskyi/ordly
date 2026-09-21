/**
 * Word-level operations on a Danish text, with no dictionary behind them.
 *
 * Split out of `lib/spelling.ts` so the composer can apply a correction without pulling the
 * 3 MB dictionary and `nspell` into the browser bundle: the checking runs on the server, the
 * editing runs where the learner is typing.
 */

/** A word the Danish dictionary does not know, with the corrections it offers, best first. */
export interface Misspelling {
  word: string
  suggestions: string[]
}

/** Words of one letter are never worth flagging, and 40+ characters is not a Danish word. */
const MIN_WORD_LENGTH = 2
const MAX_WORD_LENGTH = 40

function isLetter(character: string | undefined): boolean {
  return Boolean(character) && /\p{L}/u.test(character as string)
}

/**
 * The words of a Danish text, as a dictionary thinks of them.
 *
 * Hyphens and apostrophes are kept inside a word (`-årig`, `barnets`); anything holding a digit
 * is not a word to spell-check at all.
 */
export function danishWords(text: string): string[] {
  return text
    .normalize('NFC')
    .split(/[^\p{L}'’-]+/u)
    .map((word) => word.replace(/^[-'’]+|[-'’]+$/g, ''))
    .filter((word) => word.length >= MIN_WORD_LENGTH && word.length <= MAX_WORD_LENGTH)
}

/**
 * Replace the first standalone occurrence of `word`, leaving the rest of the text alone.
 *
 * Scanned rather than matched with a regular expression: a word boundary in Danish has to treat
 * `æøå` as letters, and the lookbehind that would express that is not safe on every iOS Safari
 * the installed app runs on. An occurrence inside a longer word is skipped, so correcting `hus`
 * never rewrites `huset`.
 */
export function replaceWordInText(text: string, word: string, replacement: string): string {
  if (!word) return text
  for (let index = text.indexOf(word); index >= 0; index = text.indexOf(word, index + 1)) {
    if (isLetter(text[index - 1]) || isLetter(text[index + word.length])) continue
    return text.slice(0, index) + replacement + text.slice(index + word.length)
  }
  return text
}
