import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const intentSchema = {
  type: 'object',
  properties: {
    intent_english: { type: 'string' },
    normalized_reading: { type: 'string' },
    ambiguity: { type: 'string', enum: ['low', 'medium', 'high'] },
  },
  required: ['intent_english', 'normalized_reading', 'ambiguity'],
  additionalProperties: false,
}

const correctionSchema = {
  type: 'object',
  properties: {
    corrected_sentence: { type: 'string' },
    translation: { type: 'string' },
    confidence: { type: 'number' },
  },
  required: ['corrected_sentence', 'translation', 'confidence'],
  additionalProperties: false,
}

const verificationSchema = {
  type: 'object',
  properties: {
    accept: { type: 'boolean' },
    grammar_correct: { type: 'boolean' },
    preserves_intent: { type: 'boolean' },
    minimal_change: { type: 'boolean' },
    confidence: { type: 'number' },
    final_sentence: { type: 'string' },
    final_translation: { type: 'string' },
    issue: { type: 'string' },
  },
  required: ['accept', 'grammar_correct', 'preserves_intent', 'minimal_change', 'confidence', 'final_sentence', 'final_translation', 'issue'],
  additionalProperties: false,
}

const languageNames: Record<string, string> = {
  ru: 'Russian',
  en: 'English',
  uk: 'Ukrainian',
}

type LanguageToolHint = {
  message: string
  text: string
  replacements: string[]
}

function cleanText(value: unknown, max = 700) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function clampConfidence(value: unknown) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.max(0, Math.min(1, number))
}

function comparable(value: string) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('da-DK')
    .replace(/[“”„]/g, '"')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

async function groqJson(schemaName: string, schema: Record<string, unknown>, messages: Array<{ role: 'system' | 'user'; content: string }>, label: string) {
  if (!process.env.GROQ_API_KEY) throw new Error('Groq is not configured')

  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b',
          reasoning_effort: 'medium',
          temperature: 0,
          messages,
          response_format: {
            type: 'json_schema',
            json_schema: { name: schemaName, strict: true, schema },
          },
        }),
        signal: AbortSignal.timeout(9000),
      })

      if (!response.ok) throw new Error(`${label}: Groq returned ${response.status}`)
      const payload = await response.json()
      const content = payload.choices?.[0]?.message?.content
      if (!content) throw new Error(`${label}: empty AI response`)
      return JSON.parse(content)
    } catch (error) {
      lastError = error
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 180))
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${label} failed`)
}

async function languageToolHints(sentence: string): Promise<LanguageToolHint[]> {
  try {
    const response = await fetch('https://api.languagetool.org/v2/check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Ordly/1.0 Danish-learning-app',
      },
      body: new URLSearchParams({
        text: sentence,
        language: 'da',
      }),
      signal: AbortSignal.timeout(3500),
    })

    if (!response.ok) return []
    const payload = await response.json()
    const matches = Array.isArray(payload.matches) ? payload.matches : []

    return matches.slice(0, 10).map((match: Record<string, unknown>) => {
      const offset = Number(match.offset) || 0
      const length = Number(match.length) || 0
      const replacements = Array.isArray(match.replacements)
        ? match.replacements
            .map((replacement: unknown) => cleanText((replacement as Record<string, unknown>)?.value, 80))
            .filter(Boolean)
            .slice(0, 5)
        : []
      return {
        message: cleanText(match.message, 180),
        text: sentence.slice(offset, offset + length),
        replacements,
      }
    })
  } catch (error) {
    console.warn('LanguageTool Danish check unavailable', error)
    return []
  }
}

function formatLanguageToolHints(hints: LanguageToolHint[]) {
  if (!hints.length) return 'No LanguageTool diagnostics were available. Do not infer that this means the sentence is correct.'
  return hints
    .map((hint, index) => `${index + 1}. Text: ${JSON.stringify(hint.text)} | ${hint.message}${hint.replacements.length ? ` | Suggestions: ${hint.replacements.join(', ')}` : ''}`)
    .join('\n')
}

async function inferIntent(sentence: string) {
  return groqJson(
    'danish_learner_intent',
    intentSchema,
    [
      {
        role: 'system',
        content: `You infer what a Danish learner intended to say BEFORE anyone corrects the sentence.

The input may contain spelling mistakes, missing spaces, merged words, wrong inflection, missing function words, or learner grammar. Do not silently replace a malformed token with an unrelated dictionary word merely because its spelling is nearby.

Critical interpretation rules:
- FIRST consider whether a suspicious token should be split into two common Danish words or repaired by a small spelling change.
- Preserve common conversational expressions and particles such as "kom så", "lad os", "godt lide", "i gang", "til at", "for at", "det er", and similar multi-word expressions.
- Distinguish lexical meaning from spelling resemblance. "kom så" means roughly "come on / come then"; "kommende" means "coming/upcoming" and is NOT a correction of "kom så".
- Infer participants, tense, polarity, modality and action as conservatively as possible from the learner's actual words.
- normalized_reading is NOT the final corrected sentence. It is only a lightly segmented/readable interpretation of what they most likely typed.
- intent_english must state the most likely intended meaning plainly in English.
- Mark ambiguity high only when two materially different meanings are genuinely plausible.

Regression example:
Input: "Komså går sammen i biofrafen"
Likely reading: "Kom så ... gå ... sammen i biografen"
Likely intent: "Come on, let's go to the cinema together."
Never interpret "Komså" as "kommende".`,
      },
      { role: 'user', content: `Learner sentence:\n${sentence}` },
    ],
    'intent inference',
  )
}

async function createCorrection(sentence: string, intent: Record<string, unknown>, hints: LanguageToolHint[], targetLanguage: string, level: string, retryFeedback = '') {
  const diagnostics = formatLanguageToolHints(hints)
  const retryInstruction = retryFeedback
    ? `\nA previous proposed correction was rejected by a critic. Fix this specific problem without changing the learner's intended meaning:\n${retryFeedback}\n`
    : ''

  return groqJson(
    'danish_conservative_correction',
    correctionSchema,
    [
      {
        role: 'system',
        content: `You are a conservative Danish teacher correcting ONE example sentence written by a ${level} learner.

Your priority order is:
1. Preserve the learner's intended meaning.
2. Produce grammatically and orthographically correct, natural contemporary Danish.
3. Make the smallest sensible change.
4. Keep the sentence at roughly the learner's current level.

Hard rules:
- Never turn a typo or missing-space error into a semantically unrelated word just because the spelling is similar.
- Before replacing a suspicious token, test whether splitting it, joining it, changing one or two letters, or fixing inflection produces a common expression that fits the sentence.
- Preserve colloquial expressions when they are valid. In particular, "kom så" is a valid expression and must never become "kommende".
- Correct spelling, compounds/spacing, word order, verb form, agreement, article, pronoun, punctuation and missing grammatical words when necessary.
- You MAY add a small function-word construction when Danish grammar requires it to express the already-inferred intent, for example "lad os" for an intended "let's ..." meaning.
- Do not add new facts, stronger emotion, a different subject, a different action, a different tense, different polarity, or different modality.
- Do not replace ordinary learner vocabulary with more elegant synonyms unless the original word cannot express the intended meaning in that grammatical context.
- If the original is already acceptable Danish, return it unchanged.
- translation must be a natural ${targetLanguage} translation of corrected_sentence.
- confidence is your confidence that BOTH the Danish and preserved meaning are correct, from 0 to 1.

Regression example:
Original: "Komså går sammen i biofrafen"
Intent: "Come on, let's go to the cinema together."
Good correction: "Kom så, lad os gå i biografen sammen."
Bad correction: "Kommende går sammen i biografen." The word "kommende" changes the meaning and is not licensed by the original.

LanguageTool diagnostics are supporting evidence only. Danish coverage is incomplete; do not blindly apply its replacements.
${retryInstruction}`,
      },
      {
        role: 'user',
        content: `Original learner sentence: ${sentence}\n\nIntent anchor: ${cleanText(intent.intent_english, 500)}\nLightly normalized reading: ${cleanText(intent.normalized_reading, 500)}\nIntent ambiguity: ${cleanText(intent.ambiguity, 20)}\n\nLanguageTool diagnostics:\n${diagnostics}`,
      },
    ],
    'sentence correction',
  )
}

async function verifyCorrection(sentence: string, intent: Record<string, unknown>, candidate: Record<string, unknown>, targetLanguage: string) {
  return groqJson(
    'danish_correction_verification',
    verificationSchema,
    [
      {
        role: 'system',
        content: `You are the independent final critic for a Danish learner correction. Be skeptical.

You receive the learner's original sentence, an independently inferred intent anchor, and a proposed correction. Judge the correction, not the learner.

Reject the proposal if ANY of these are true:
- it changes who is doing the action;
- it changes the action, tense, polarity, modality, or conversational force;
- it replaces a likely typo/merged expression with an unrelated near-spelling word;
- it introduces meaning not supported by the original;
- it is not actually grammatical/natural contemporary Danish;
- it rewrites substantially more than needed when a closer correction exists.

Special regression rule: "kom så" and "kommende" are unrelated in this context. A correction from a likely "kom så" to "kommende" MUST be rejected.

If the candidate is good, set accept=true and repeat it in final_sentence.
If the candidate is bad but you can confidently repair it while preserving the intent, set accept=false and put the safer correction in final_sentence.
final_translation must translate final_sentence naturally into ${targetLanguage}.
confidence measures confidence in final_sentence, not in the rejected candidate.
issue should be a short technical reason for rejection, or an empty string when accepted.`,
      },
      {
        role: 'user',
        content: `Original: ${sentence}\nIntent anchor: ${cleanText(intent.intent_english, 500)}\nNormalized reading: ${cleanText(intent.normalized_reading, 500)}\n\nProposed correction: ${cleanText(candidate.corrected_sentence, 700)}\nProposed translation: ${cleanText(candidate.translation, 700)}\nProposed confidence: ${clampConfidence(candidate.confidence)}`,
      },
    ],
    'sentence correction verification',
  )
}

function usableResult(sentence: string, verification: Record<string, unknown>) {
  const finalSentence = cleanText(verification.final_sentence)
  const finalTranslation = cleanText(verification.final_translation)
  const confidence = clampConfidence(verification.confidence)
  const grammarCorrect = Boolean(verification.grammar_correct)
  const preservesIntent = Boolean(verification.preserves_intent)

  if (!finalSentence || !finalTranslation) return false
  if (!grammarCorrect || !preservesIntent) return false
  if (confidence < 0.62) return false
  if (finalSentence.length > Math.max(140, sentence.length * 3.2)) return false
  return true
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const sentence = String(body.sentence || '').trim()
  if (!sentence) return NextResponse.json({ error: 'Example sentence is required.' }, { status: 400 })
  if (sentence.length > 700) return NextResponse.json({ error: 'Example sentence is too long.' }, { status: 400 })
  if (!process.env.GROQ_API_KEY) return NextResponse.json({ error: 'AI is not configured.' }, { status: 503 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_translation_language, danish_level')
    .single()

  const targetLanguage = languageNames[profile?.default_translation_language || 'ru'] || 'Russian'
  const level = String(profile?.danish_level || 'A1')

  try {
    const [intent, hints] = await Promise.all([
      inferIntent(sentence),
      languageToolHints(sentence),
    ])

    let candidate = await createCorrection(sentence, intent, hints, targetLanguage, level)
    let verification = await verifyCorrection(sentence, intent, candidate, targetLanguage)

    if (!usableResult(sentence, verification)) {
      const feedback = cleanText(verification.issue, 400) || 'The final critic was not confident that the proposal was grammatical, minimal, and meaning-preserving.'
      candidate = await createCorrection(sentence, intent, hints, targetLanguage, level, feedback)
      verification = await verifyCorrection(sentence, intent, candidate, targetLanguage)
    }

    if (!usableResult(sentence, verification)) {
      console.warn('Rejected unsafe example correction', {
        sentence,
        intent: cleanText(intent.intent_english, 200),
        candidate: cleanText(candidate.corrected_sentence, 200),
        verification,
      })
      return NextResponse.json({
        error: 'I could not correct this sentence confidently without risking changing your meaning. Please adjust it slightly and try again.',
      }, { status: 422 })
    }

    const correctedSentence = cleanText(verification.final_sentence)
    const translation = cleanText(verification.final_translation)
    const confidence = clampConfidence(verification.confidence)
    const isCorrect = comparable(correctedSentence) === comparable(sentence) && Boolean(verification.grammar_correct)

    return NextResponse.json({
      is_correct: isCorrect,
      corrected_sentence: isCorrect ? sentence : correctedSentence,
      translation,
      confidence,
      intent: cleanText(intent.intent_english, 500),
      checked_with: hints.length ? ['intent', 'languagetool', 'critic'] : ['intent', 'critic'],
    })
  } catch (error) {
    console.error('Example sentence correction pipeline failed', error)
    return NextResponse.json({ error: 'Could not check this example sentence. Please try again.' }, { status: 502 })
  }
}
