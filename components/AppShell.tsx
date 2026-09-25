import { cookieLanguage } from '@/lib/i18n/server'
import type { TranslationLanguage } from '@/lib/types'
import { AppNav } from './AppNav'
import { I18nProvider } from './I18nProvider'
import { RouteTransitionFeedback } from './RouteTransitionFeedback'

/**
 * Every signed-in page. `language` is the profile's learner language, which the page reads in
 * the same parallel batch as its own data, so the interface follows it at no extra round trip
 * (issue #24). A frame with no profile at hand (a loading screen) falls back to the mirrored cookie.
 */
export async function AppShell({ children, language }: { children: React.ReactNode; language?: TranslationLanguage }): Promise<React.JSX.Element> {
  return (
    <I18nProvider language={language ?? await cookieLanguage()} fromProfile={language !== undefined}>
      <div className="app-shell">
        <AppNav />
        <RouteTransitionFeedback />
        <main className="main-content">{children}</main>
      </div>
    </I18nProvider>
  )
}
