export type PronunciationCandidate = {
  id: string
  source: 'ddo' | 'wiktionary'
  ipa: string
}

export type PronunciationResolution = {
  ipa: string
  source: 'ddo' | 'wiktionary' | 'groq'
  confidence: number
  needsTieBreak: boolean
  candidates: PronunciationCandidate[]
  ddoIpa: string[]
  wiktionaryIpa: string[]
}

const LOOKUP_TIMEOUT_MS = 2200
const WIKIPRON_TIMEOUT_MS = 4000
const REVALIDATE_SECONDS = 60 * 60 * 24 * 30
const WIKIPRON_DATASET_BASE = 'https://huggingface.co/datasets/StephanAkkerman/wikipron-words-ipa/resolve/main'

export function normalizePronunciationText(value: string) {
  return value.trim().toLocaleLowerCase('da-DK').replace(/\s+/g, ' ')
}

export function isSingleDictionaryWord(value: string) {
  return /^[\p{L}\p{M}-]+$/u.test(value.trim())
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
}

function stripHtml(value: string) {
  return decodeHtml(value.replace(/<br\s*\/?\s*>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function isCompleteIpa(value: string) {
  const inner = value.replace(/^[[/]|[\]/]$/g, '').trim()
  if (inner.length < 2 || inner.length > 90) return false
  if (/^-|-$/.test(inner)) return false
  if (!/[a-zA-Zæøåɑɒɐəɛεɜɞɶœʌɔɪʊyðŋʁʋɡ]/u.test(inner)) return false
  return true
}

function withTimeout(timeout = LOOKUP_TIMEOUT_MS) {
  return AbortSignal.timeout(timeout)
}

export async function fetchDdoPronunciations(word: string): Promise<string[]> {
  try {
    const response = await fetch(`https://ordnet.dk/ddo/ordbog/${encodeURIComponent(word)}`, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'Ordly/1.0 (personal Danish study app; pronunciation lookup)',
      },
      redirect: 'follow',
      signal: withTimeout(),
      next: { revalidate: REVALIDATE_SECONDS },
    })
    if (!response.ok) return []

    const html = await response.text()
    const text = stripHtml(html)
    const pronunciationIndex = text.indexOf('Udtale')
    if (pronunciationIndex < 0) return []

    const after = text.slice(pronunciationIndex + 'Udtale'.length, pronunciationIndex + 1200)
    const stopLabels = ['Oprindelse', 'Betydninger', 'Ord i nærheden', 'Grammatik', 'Eksempler', 'Se også']
    let stop = after.length
    for (const label of stopLabels) {
      const index = after.indexOf(label)
      if (index >= 0) stop = Math.min(stop, index)
    }

    const section = after.slice(0, stop)
    const matches = [...section.matchAll(/\[([^\]\n]{1,90})\]/g)].map((match) => `[${match[1].trim()}]`)
    return unique(matches).filter(isCompleteIpa).slice(0, 6)
  } catch (error) {
    console.warn('DDO pronunciation lookup failed', error)
    return []
  }
}

async function fetchLiveWiktionaryPronunciations(word: string): Promise<string[]> {
  try {
    const params = new URLSearchParams({
      action: 'parse',
      page: word,
      prop: 'text',
      format: 'json',
      formatversion: '2',
      redirects: '1',
    })
    const response = await fetch(`https://en.wiktionary.org/w/api.php?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
        'Api-User-Agent': 'Ordly/1.0 (personal Danish study app; pronunciation lookup)',
      },
      signal: withTimeout(),
      next: { revalidate: REVALIDATE_SECONDS },
    })
    if (!response.ok) return []

    const payload = await response.json()
    const html = String(payload?.parse?.text || '')
    if (!html) return []

    const danishMarker = html.indexOf('id="Danish"')
    if (danishMarker < 0) return []
    const nextLanguage = html.indexOf('<h2', danishMarker + 12)
    const danishSection = html.slice(danishMarker, nextLanguage > danishMarker ? nextLanguage : undefined)

    const pronunciationMarker = danishSection.indexOf('id="Pronunciation"')
    if (pronunciationMarker < 0) return []
    const afterPronunciation = danishSection.slice(pronunciationMarker)
    const nextHeading = afterPronunciation.search(/<h[23][^>]*>/i)
    const pronunciationSection = nextHeading > 0 ? afterPronunciation.slice(0, nextHeading) : afterPronunciation.slice(0, 5000)

    const ipaSpans = [...pronunciationSection.matchAll(/<span[^>]*class="[^"]*\bIPA\b[^"]*"[^>]*>([\s\S]*?)<\/span>/gi)]
      .map((match) => stripHtml(match[1]))
      .filter(isCompleteIpa)

    return unique([
      ...ipaSpans.filter((ipa) => ipa.startsWith('[')),
      ...ipaSpans.filter((ipa) => !ipa.startsWith('[')),
    ]).slice(0, 8)
  } catch (error) {
    console.warn('Wiktionary pronunciation lookup failed', error)
    return []
  }
}

function normalizeWikiPronIpa(value: string) {
  // WikiPron stores IPA phonemes separated by spaces. This is a single-word
  // lookup, so remove those separator spaces before comparing or converting.
  return value.trim().replace(/\s+/g, '')
}

async function fetchWikiPronFile(word: string, filename: string): Promise<string[]> {
  try {
    const response = await fetch(`${WIKIPRON_DATASET_BASE}/${filename}`, {
      headers: {
        Accept: 'text/tab-separated-values,text/plain;q=0.9,*/*;q=0.5',
        'User-Agent': 'Ordly/1.0 (personal Danish study app; WikiPron lookup)',
      },
      signal: withTimeout(WIKIPRON_TIMEOUT_MS),
      next: { revalidate: REVALIDATE_SECONDS },
    })
    if (!response.ok) return []

    const normalizedWord = normalizePronunciationText(word)
    const body = await response.text()
    const matches: string[] = []

    for (const line of body.split('\n')) {
      const tab = line.indexOf('\t')
      if (tab <= 0) continue
      const orthography = normalizePronunciationText(line.slice(0, tab))
      if (orthography !== normalizedWord) continue

      const ipa = normalizeWikiPronIpa(line.slice(tab + 1))
      if (isCompleteIpa(ipa)) matches.push(ipa)
    }

    return unique(matches).slice(0, 8)
  } catch (error) {
    console.warn(`WikiPron lookup failed for ${filename}`, error)
    return []
  }
}

export async function fetchWikiPronPronunciations(word: string): Promise<string[]> {
  const [narrow, broad] = await Promise.all([
    fetchWikiPronFile(word, 'dan_latn_narrow.tsv'),
    fetchWikiPronFile(word, 'dan_latn_broad.tsv'),
  ])
  return unique([...narrow, ...broad]).slice(0, 12)
}

export async function fetchWiktionaryPronunciations(word: string): Promise<string[]> {
  // Keep the existing public function so the rest of the pipeline does not need
  // a schema change. The candidate pool now contains both live Wiktionary and
  // the Danish WikiPron snapshot hosted on Hugging Face. DDO remains the
  // preferred authority; this larger pool gives it an independent sound-level
  // cross-check and provides a dictionary fallback when the live API is sparse.
  const [live, wikiPron] = await Promise.all([
    fetchLiveWiktionaryPronunciations(word),
    fetchWikiPronPronunciations(word),
  ])
  return unique([...live, ...wikiPron]).slice(0, 16)
}

function comparableIpa(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^[[/]|[\]/]$/g, '')
    .replace(/[ˈˌːˑˀ̯]/g, '')
    .replaceAll('ε', 'ɛ')
    .replaceAll('ɡ', 'g')
    .replaceAll('ʋ', 'v')
    .replaceAll('ʁ', 'r')
    .replaceAll('ɶ', 'œ')
    .replaceAll('ɒ', 'ɑ')
    .replace(/\s+/g, '')
}

function levenshtein(a: string, b: string) {
  if (!a.length) return b.length
  if (!b.length) return a.length
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  const current = new Array<number>(b.length + 1)

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j]
  }
  return previous[b.length]
}

function similarity(a: string, b: string) {
  const left = comparableIpa(a)
  const right = comparableIpa(b)
  const length = Math.max(left.length, right.length)
  if (!length) return 0
  return Math.max(0, 1 - levenshtein(left, right) / length)
}

export function resolveDictionaryPronunciation(ddoIpa: string[], wiktionaryIpa: string[]): PronunciationResolution | null {
  const ddo = unique(ddoIpa).filter(isCompleteIpa)
  const wiki = unique(wiktionaryIpa).filter(isCompleteIpa)
  const candidates: PronunciationCandidate[] = [
    ...ddo.map((ipa, index) => ({ id: `d${index}`, source: 'ddo' as const, ipa })),
    ...wiki.map((ipa, index) => ({ id: `w${index}`, source: 'wiktionary' as const, ipa })),
  ]

  if (!candidates.length) return null
  if (ddo.length && !wiki.length) {
    return { ipa: ddo[0], source: 'ddo', confidence: 0.88, needsTieBreak: false, candidates, ddoIpa: ddo, wiktionaryIpa: wiki }
  }
  if (!ddo.length && wiki.length) {
    return { ipa: wiki[0], source: 'wiktionary', confidence: 0.8, needsTieBreak: false, candidates, ddoIpa: ddo, wiktionaryIpa: wiki }
  }

  let best = { ddo: ddo[0], wiki: wiki[0], score: -1 }
  for (const ddoCandidate of ddo) {
    for (const wikiCandidate of wiki) {
      const score = similarity(ddoCandidate, wikiCandidate)
      if (score > best.score) best = { ddo: ddoCandidate, wiki: wikiCandidate, score }
    }
  }

  // DDO is the preferred authority when it substantially agrees with either
  // live Wiktionary or the Hugging Face WikiPron snapshot.
  if (best.score >= 0.72) {
    return {
      ipa: best.ddo,
      source: 'ddo',
      confidence: Math.min(0.99, 0.74 + best.score * 0.25),
      needsTieBreak: false,
      candidates,
      ddoIpa: ddo,
      wiktionaryIpa: wiki,
    }
  }

  return {
    ipa: best.ddo,
    source: 'ddo',
    confidence: Math.max(0.35, best.score),
    needsTieBreak: true,
    candidates,
    ddoIpa: ddo,
    wiktionaryIpa: wiki,
  }
}

const IPA_MAP: Array<[string, string]> = [
  ['tɕ', 'ч'], ['dʑ', 'дж'], ['ts', 'ц'], ['dz', 'дз'], ['ŋ', 'нг'], ['ɲ', 'нь'],
  ['ɑj', 'ай'], ['aj', 'ай'], ['ɔj', 'ой'], ['øj', 'ёй'], ['ɒw', 'оу'], ['aw', 'ау'],
  ['æɐ', 'эа'], ['ɛɐ', 'эа'], ['εɐ', 'эа'], ['œɐ', 'ёа'], ['ɶɐ', 'ёа'], ['øɐ', 'ёа'],
  ['ʁ', 'р'], ['r', 'р'], ['ʋ', 'в'], ['v', 'в'], ['w', 'у'], ['ð', 'д'], ['θ', 'т'],
  ['p', 'п'], ['b', 'б'], ['t', 'т'], ['d', 'д'], ['k', 'к'], ['g', 'г'], ['ɡ', 'г'],
  ['f', 'ф'], ['s', 'с'], ['z', 'з'], ['ɕ', 'щ'], ['ʃ', 'ш'], ['ʒ', 'ж'], ['h', 'х'], ['ç', 'хь'], ['x', 'х'],
  ['m', 'м'], ['n', 'н'], ['l', 'л'], ['j', 'й'],
  ['i', 'и'], ['ɪ', 'и'], ['e', 'э'], ['ɛ', 'э'], ['ε', 'э'], ['æ', 'э'],
  ['a', 'а'], ['ɑ', 'а'], ['ɒ', 'о'], ['ɐ', 'а'], ['ə', 'е'], ['ʌ', 'а'], ['ɜ', 'э'],
  ['y', 'ю'], ['ʏ', 'ю'], ['ø', 'ё'], ['œ', 'ё'], ['ɶ', 'ё'],
  ['u', 'у'], ['ʊ', 'у'], ['o', 'о'], ['ɔ', 'о'], ['ɞ', 'ё'],
]

const IPA_VOWEL = /[iɪeɛεæaɑɒɐəʌɜyʏøœɶuʊoɔɞ]/u

function isCyrillicVowel(value: string) {
  return /[аеёиоуыэюя]/i.test(value)
}

export function ipaToCyrillic(ipa: string) {
  let input = ipa
    .replace(/^[[/]|[\]/]$/g, '')
    .replaceAll('ε', 'ɛ')
    .replace(/[̥̬̠̞̝̹̜̟̩̯]/g, '')
    .replace(/[ˀ]/g, '')
    .trim()

  let output = ''
  let stressNextVowel = false

  for (let index = 0; index < input.length;) {
    const char = input[index]
    if (char === 'ˈ') {
      stressNextVowel = true
      index += 1
      continue
    }
    if (char === 'ˌ') {
      index += 1
      continue
    }
    if (/\s/.test(char)) {
      output = output.trimEnd() + ' '
      index += 1
      continue
    }

    let matched = false
    for (const [phoneme, cyrillic] of IPA_MAP) {
      if (!input.startsWith(phoneme, index)) continue
      let rendered = cyrillic
      const nextIndex = index + phoneme.length
      const isLong = input[nextIndex] === 'ː'
      const nextSound = isLong ? input[nextIndex + 1] || '' : input[nextIndex] || ''
      const vowelImmediatelyFollows = isLong && IPA_VOWEL.test(nextSound)

      if (stressNextVowel && [...rendered].some(isCyrillicVowel)) {
        const chars = [...rendered]
        const vowelIndex = chars.findIndex(isCyrillicVowel)
        chars[vowelIndex] = `${chars[vowelIndex]}́`
        rendered = chars.join('')
        stressNextVowel = false
      }

      output += rendered

      // Doubling is useful for an isolated long vowel, but it overstates words
      // such as bare [ˈbɑːɑ]: the next vowel already gives the Russian reader
      // the audible continuation. Without this guard the deterministic draft
      // becomes бааа instead of the much more useful баа.
      if (isLong && !vowelImmediatelyFollows && [...rendered].some(isCyrillicVowel)) {
        const lastVowel = [...rendered].reverse().find(isCyrillicVowel)
        if (lastVowel) output += lastVowel
      }

      index = nextIndex + (isLong ? 1 : 0)
      matched = true
      break
    }

    if (!matched) {
      if (char === 'ː' || char === '.' || char === '‿' || char === '|' || char === '⁀') {
        index += 1
        continue
      }
      if (char === '-') output += '-'
      index += 1
    }
  }

  return output.replace(/\s+/g, ' ').replace(/-{2,}/g, '-').trim()
}
