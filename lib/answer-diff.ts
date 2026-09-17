import { editDistance } from './answer'

/**
 * A word-then-letter diff between what the learner typed and the corrected answer.
 *
 * Whole words are aligned first, so a missing or extra word is marked as a word. A wrong word
 * that is a near miss of the word it replaces (`Jeg`/`jeg`, `arbejer`/`arbejder`) is then aligned
 * letter by letter, so only the letters that actually differ are marked. Pure and offline.
 */

export interface DiffPart {
  text: string
  changed: boolean
}

export interface AnswerDiff {
  /** The learner's answer. `changed` marks what was wrong or extra. */
  actual: DiffPart[]
  /** The corrected answer. `changed` marks what the learner missed or got wrong. */
  expected: DiffPart[]
  identical: boolean
}

type Op<T> = { type: 'eq'; a: T; b: T } | { type: 'del'; a: T } | { type: 'ins'; b: T }

function align<T>(left: readonly T[], right: readonly T[], same: (a: T, b: T) => boolean): Op<T>[] {
  const table = Array.from({ length: left.length + 1 }, () => new Array<number>(right.length + 1).fill(0))
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      table[i][j] = same(left[i], right[j]) ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }
  const ops: Op<T>[] = []
  let i = 0
  let j = 0
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && same(left[i], right[j])) {
      ops.push({ type: 'eq', a: left[i], b: right[j] })
      i += 1
      j += 1
    } else if (j < right.length && (i === left.length || table[i][j + 1] >= table[i + 1][j])) {
      ops.push({ type: 'ins', b: right[j] })
      j += 1
    } else {
      ops.push({ type: 'del', a: left[i] })
      i += 1
    }
  }
  return ops
}

/** Punctuation around a word does not make it a different word. */
function wordKey(token: string, first: boolean): string {
  const bare = token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
  return first ? bare.toLocaleLowerCase('da-DK') : bare
}

function nearMiss(left: string, right: string): boolean {
  const a = left.toLocaleLowerCase('da-DK')
  const b = right.toLocaleLowerCase('da-DK')
  const longest = Math.max([...a].length, [...b].length)
  return longest > 0 && editDistance(a, b) <= Math.max(1, Math.floor(longest * 0.45))
}

function merge(parts: DiffPart[]): DiffPart[] {
  const merged: DiffPart[] = []
  for (const part of parts) {
    if (!part.text) continue
    const last = merged.at(-1)
    if (last && last.changed === part.changed) last.text += part.text
    else merged.push({ ...part })
  }
  return merged
}

function letters(actual: string, expected: string): { actual: DiffPart[]; expected: DiffPart[] } {
  const ops = align([...actual], [...expected], (a, b) => a === b)
  return {
    actual: ops.flatMap((op): DiffPart[] => op.type === 'eq' ? [{ text: op.a, changed: false }] : op.type === 'del' ? [{ text: op.a, changed: true }] : []),
    expected: ops.flatMap((op): DiffPart[] => op.type === 'eq' ? [{ text: op.b, changed: false }] : op.type === 'ins' ? [{ text: op.b, changed: true }] : []),
  }
}

export function diffAnswer(actualText: string, expectedText: string): AnswerDiff {
  const actualTokens = actualText.trim().split(/\s+/u).filter(Boolean).map((text, index) => ({ text, index }))
  const expectedTokens = expectedText.trim().split(/\s+/u).filter(Boolean).map((text, index) => ({ text, index }))
  const ops = align(actualTokens, expectedTokens, (a, b) => {
    const first = a.index === 0 && b.index === 0
    return wordKey(a.text, first) === wordKey(b.text, first) && wordKey(a.text, first) !== ''
  })

  const actual: DiffPart[][] = []
  const expected: DiffPart[][] = []
  let dels: string[] = []
  let ins: string[] = []

  // A run of removed words next to a run of added words is a replacement. Pair near misses in
  // order and diff them by letter; anything left over is a whole wrong or missing word.
  function flush(): void {
    let from = 0
    const pairs = new Map<number, number>()
    dels.forEach((word, d) => {
      for (let k = from; k < ins.length; k += 1) {
        if (nearMiss(word, ins[k])) {
          pairs.set(d, k)
          from = k + 1
          return
        }
      }
    })
    const pairedIns = new Set(pairs.values())
    dels.forEach((word, d) => {
      const k = pairs.get(d)
      actual.push(k === undefined ? [{ text: word, changed: true }] : letters(word, ins[k]).actual)
    })
    ins.forEach((word, k) => {
      if (!pairedIns.has(k)) {
        expected.push([{ text: word, changed: true }])
        return
      }
      const d = [...pairs.entries()].find(([, value]) => value === k)![0]
      expected.push(letters(dels[d], word).expected)
    })
    dels = []
    ins = []
  }

  for (const op of ops) {
    if (op.type === 'eq') {
      flush()
      actual.push([{ text: op.a.text, changed: false }])
      expected.push([{ text: op.b.text, changed: false }])
    } else if (op.type === 'del') dels.push(op.a.text)
    else ins.push(op.b.text)
  }
  flush()

  const join = (words: DiffPart[][]): DiffPart[] => merge(words.flatMap((parts, index) => index ? [{ text: ' ', changed: false }, ...parts] : parts))
  const actualParts = join(actual)
  const expectedParts = join(expected)
  return {
    actual: actualParts,
    expected: expectedParts,
    identical: !actualParts.some((part) => part.changed) && !expectedParts.some((part) => part.changed),
  }
}
