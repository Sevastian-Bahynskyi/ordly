'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { INTERFACE_LANGUAGE_COOKIE, messagesFor, type Messages } from '@/lib/i18n'
import type { TranslationLanguage } from '@/lib/types'

interface I18nValue {
  language: TranslationLanguage
  t: Messages
  /** Switch every client string at once, before the server has re-rendered (Settings). */
  setLanguage: (language: TranslationLanguage) => void
}

const I18nContext = createContext<I18nValue | null>(null)

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

/**
 * `fromProfile` marks the provider that knows the profile's language (AppShell). Only it mirrors
 * the language into the cookie and `<html lang>`: the root provider only has the cookie, and its
 * effect runs after the nested one's, so letting it write would undo the profile's value.
 */
export function I18nProvider({ language, fromProfile = false, children }: { language: TranslationLanguage; fromProfile?: boolean; children: React.ReactNode }): React.JSX.Element {
  const [current, setCurrent] = useState(language)
  // A server render with a newer preference (after Settings refreshes the route) wins.
  useEffect(() => setCurrent(language), [language])
  useEffect(() => {
    if (!fromProfile) return
    document.documentElement.lang = current
    document.cookie = `${INTERFACE_LANGUAGE_COOKIE}=${current}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`
  }, [current, fromProfile])
  const value = useMemo<I18nValue>(() => ({ language: current, t: messagesFor(current), setLanguage: setCurrent }), [current])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n needs an I18nProvider above it')
  return value
}
