'use client'

import { DEFAULT_LEARNER_LANGUAGE } from '@/lib/learner-language'
import { EntryEditor } from './EntryEditor'
import type { TranslationLanguage } from '@/lib/types'

/**
 * Quick capture on Home, Words and Sentences. This is a thin wrapper over `EntryEditor` (D7):
 * add-new and edit-existing are genuinely the same component, so an AI action, a keyboard
 * shortcut or a sense control added for one surface exists on the other by construction.
 */
export function AddWordComposer({
  compact = false,
  translationLanguage = DEFAULT_LEARNER_LANGUAGE,
}: {
  compact?: boolean
  translationLanguage?: TranslationLanguage
}): React.JSX.Element {
  return <EntryEditor mode="create" compact={compact} translationLanguage={translationLanguage} />
}
