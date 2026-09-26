import { cookies } from 'next/headers'
import { learnerLanguage } from '../learner-language'
import type { TranslationLanguage } from '../types'
import { INTERFACE_LANGUAGE_COOKIE, messagesFor, type Messages } from '.'

/** The mirrored preference, for a server screen that has no profile to read (sign-in, loading). */
export async function cookieLanguage(): Promise<TranslationLanguage> {
  return learnerLanguage((await cookies()).get(INTERFACE_LANGUAGE_COOKIE)?.value)
}

/** Interface text for a route handler's user-facing error lines, in the caller's language. */
export async function interfaceMessages(): Promise<Messages> {
  return messagesFor(await cookieLanguage())
}
