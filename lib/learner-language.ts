import type { TranslationLanguage } from './types'

/**
 * The one app-wide learner-language preference (issue #14, spec #12 decision 13).
 *
 * New profiles start in English. An existing profile keeps whatever it holds, including
 * Ukrainian, and a switch only changes which supplied wording is offered from now on: it never
 * rewrites a meaning the learner already saved.
 */
export const DEFAULT_LEARNER_LANGUAGE: TranslationLanguage = 'en'

export const LEARNER_LANGUAGES: readonly TranslationLanguage[] = ['en', 'ru', 'uk']

export const LEARNER_LANGUAGE_NAMES: Record<TranslationLanguage, string> = { en: 'English', ru: 'Russian', uk: 'Ukrainian' }

export function isTranslationLanguage(value: unknown): value is TranslationLanguage {
  return LEARNER_LANGUAGES.includes(value as TranslationLanguage)
}

/** A stored preference, or the default when a profile has none. */
export function learnerLanguage(value: unknown): TranslationLanguage {
  return isTranslationLanguage(value) ? value : DEFAULT_LEARNER_LANGUAGE
}
