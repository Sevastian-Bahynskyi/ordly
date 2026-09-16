import { OPENROUTER_MODEL_ROUTES, openRouterJson } from './openrouter'
import { parseRefinedMeanings, refinementSchema, type RefinedMeaning } from './sense-refinement'
import { PARTS_OF_SPEECH } from './senses'

export const MAX_REFINED_SENSES = 8
export const MAX_REFINED_SENSE_LENGTH = 120

/**
 * One AI call classifying an entry's meanings (D11 phase 2). Shared by `/api/ai/refine-senses` and
 * `scripts/refine-all-senses.ts`, so the on-demand path and the one-off catch-up use one prompt.
 */
export async function classifySenses(danish: string, texts: readonly string[]): Promise<RefinedMeaning[]> {
  const parsed = await openRouterJson({
    temperature: 0,
    max_tokens: 240,
    messages: [
      {
        role: 'system',
        content: `You classify the meanings of a Danish vocabulary entry for a learner's flashcards.
You receive the Danish entry and a numbered list of its meanings in the learner's language. Some meanings were produced by splitting on commas, so one real meaning may have been broken into adjacent fragments.

Return one object per real meaning:
- indices: the 1-based numbers of the listed items that form this meaning. Usually a single number. Use several ONLY when adjacent items are fragments of one meaning that a comma split apart. Never group two genuinely different meanings, and never group synonyms that each stand on their own.
- pos: the part of speech of the DANISH entry in that meaning, one of: ${PARTS_OF_SPEECH.join(', ')}. Use "phrase" for a multi-word expression with no single head word. Use "" only when you genuinely cannot tell.
- gender: for a noun only, the Danish article "en" or "et". Otherwise "".
Cover every listed item exactly once. Do not translate, rewrite or add meanings.`,
      },
      {
        role: 'user',
        content: `Danish: ${danish}\nMeanings:\n${texts.map((text, index) => `${index + 1}. ${text}`).join('\n')}`,
      },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'sense_refinement', strict: true, schema: refinementSchema } },
  }, 'sense refinement', { models: OPENROUTER_MODEL_ROUTES.translation, timeoutMs: 10000 })
  return parseRefinedMeanings(parsed, texts.length)
}
