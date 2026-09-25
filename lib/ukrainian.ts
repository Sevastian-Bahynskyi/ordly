/**
 * Is this Ukrainian, or Russian filed as Ukrainian? (issue #24)
 *
 * Both are Cyrillic, so the script check every other learner language gets proves nothing here:
 * a Russian gloss copied into the Ukrainian column passes it. These deterministic tests do:
 *
 * - **Letters.** ы, э, ъ and ё do not exist in Ukrainian.
 * - **Words.** A word the Russian dictionary knows and the Ukrainian one does not (`кошка`,
 *   `сейчас`, `думать`, `что`) gives Russian away. A shared word (`книга`, `театр`) proves nothing
 *   either way, and a word neither dictionary knows (a name, a rare compound) is left alone.
 * - **Verb meanings.** A Russian infinitive (`любить`, `заблудиться`) is usually also a real
 *   Ukrainian word — the third person — so a verb sense's wording must be a Ukrainian infinitive
 *   (`-ти`, `-тися`, `-тись`, `-чи`).
 * - **Recognition.** Text of several words that Ukrainian mostly cannot read is not Ukrainian,
 *   even with no Russian word in it.
 *
 * The dictionaries are passed in (`lib/ukrainian-dictionaries.ts` builds them for the offline
 * pipeline), so this stays a pure function.
 */
export interface SpellCheckers {
  uk: (word: string) => boolean
  ru: (word: string) => boolean
}

const RUSSIAN_ONLY_LETTERS = ['ы', 'э', 'ъ', 'ё']
const CYRILLIC = /\p{Script=Cyrillic}/u
const LATIN = /\p{Script=Latin}/u
const UKRAINIAN_LETTERS = /[іїєґ]/iu
const WORD = /[\p{Script=Cyrillic}'’ʼ-]+/gu
/** A word written in both scripts: a Latin homoglyph inside Cyrillic (`кaва` with a Latin a). */
const MIXED_WORD = /(?=[\p{L}'’ʼ-]*\p{Script=Latin})(?=[\p{L}'’ʼ-]*\p{Script=Cyrillic})[\p{L}'’ʼ-]+/u
/**
 * Standard Ukrainian words the Ukrainian Hunspell dictionary does not list, each checked by hand
 * against a Ukrainian dictionary before it was added. Without them the Russian dictionary, which
 * does list them, would call them Russian.
 */
const UKRAINIAN_EXTRA = new Set(['клятва'])
/** An abbreviation (`напр.`, `дн.`, `числ.`): a short word followed by a full stop, not a sentence end. */
const ABBREVIATION = /(?<![\p{L}])(\p{Script=Cyrillic}{1,4})\.(?=\s*[\p{Ll}\d,;)]|$)/gu

/** Words Hunspell should judge: apostrophes unified, hyphen-edges trimmed, abbreviations left out. */
function words(text: string): string[] {
  return (text.replace(ABBREVIATION, ' ').match(WORD) || [])
    .map((word) => word.replace(/[’ʼ]/gu, "'").replace(/^[-']+|[-']+$/gu, ''))
    .filter((word) => CYRILLIC.test(word))
}

function knows(check: (word: string) => boolean, word: string): boolean {
  return UKRAINIAN_EXTRA.has(word.toLocaleLowerCase('uk-UA')) || check(word) || check(word.toLocaleLowerCase('uk-UA'))
}

/**
 * Every reason `text` is not Ukrainian, one line each. Empty means it passes. A whole Latin word
 * (`CD`, a quoted Danish word) is allowed; a word mixing the two scripts is not.
 */
export function ukrainianProblems(text: string, spell: SpellCheckers): string[] {
  const value = text.trim()
  if (!value) return ['empty']
  if (!CYRILLIC.test(value)) return ['not Cyrillic']
  const problems: string[] = []
  if (MIXED_WORD.test(value)) problems.push('mixed-script word')
  const lower = value.toLocaleLowerCase('ru-RU')
  const letters = RUSSIAN_ONLY_LETTERS.filter((letter) => lower.includes(letter))
  if (letters.length) problems.push(`Russian letters: ${letters.join(', ')}`)
  // A hyphenated word neither dictionary lists whole (`из-за`) is judged by its parts.
  const tokens = words(value).flatMap((word) => word.includes('-') && !knows(spell.uk, word) ? word.split('-').filter(Boolean) : [word])
  const russian = tokens.filter((word) => !UKRAINIAN_LETTERS.test(word) && !knows(spell.uk, word) && (spell.ru(word) || spell.ru(word.toLocaleLowerCase('uk-UA'))))
  if (russian.length) problems.push(`Russian words: ${[...new Set(russian)].join(', ')}`)
  else if (!letters.length && tokens.length >= 2 && tokens.filter((word) => !knows(spell.uk, word)).length * 2 > tokens.length) problems.push('not recognised as Ukrainian')
  return problems
}

const UKRAINIAN_INFINITIVE = /(?:ти|тися|тись|чи)$/u

/** The first word of each comma-separated alternative, ignoring a parenthetical note. */
function leadWords(text: string): string[] {
  return text.replace(/\([^)]*\)/gu, ' ').split(/[,;]/u).map((part) => words(part)[0]).filter((word): word is string => Boolean(word))
}

/** `ukrainianProblems` for a catalog sense's wording, which also knows its part of speech. */
export function ukrainianWordingProblems(text: string, pos: string | null, spell: SpellCheckers): string[] {
  const problems = ukrainianProblems(text, spell)
  if (pos === 'verb') {
    const russian = leadWords(text).map((word) => word.toLocaleLowerCase('uk-UA')).filter((word) => !UKRAINIAN_INFINITIVE.test(word) && /(?:ть|ться|чь)$/u.test(word))
    if (russian.length) problems.push(`verb not a Ukrainian infinitive: ${russian.join(', ')}`)
  }
  return problems
}
