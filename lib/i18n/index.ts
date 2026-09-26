import type { TranslationLanguage } from '../types'
import { en, type Messages } from './en'
import { ru } from './ru'
import { uk } from './uk'

/**
 * Interface text in the learner language (issue #24). The learner-language preference drives the
 * whole app: every screen reads its strings from here, English, Russian or Ukrainian. English is
 * the reference dictionary; the other two are typed against it, so a missing string is a type
 * error rather than a screen showing another language.
 */
export type { Messages }

export const MESSAGES: Record<TranslationLanguage, Messages> = { en, ru, uk }

export function messagesFor(language: TranslationLanguage): Messages {
  return MESSAGES[language]
}

/**
 * The preference mirrored into a cookie. The profile is the source of truth; the cookie only lets
 * a screen with no profile at hand (sign-in, a loading frame, an API error line) speak the same
 * language. The provider rewrites it whenever the profile's language reaches the page.
 */
export const INTERFACE_LANGUAGE_COOKIE = 'ordly-lang'
