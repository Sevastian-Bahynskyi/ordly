import { redirect } from 'next/navigation'
import { guidedPracticeEnabled } from '@/lib/practice-config'
import type { JSX } from 'react'
import { AppShell } from '@/components/AppShell'
import { PracticeSession } from '@/components/PracticeSession'
import { requireUser } from '@/lib/auth'
import { learnerLanguage } from '@/lib/learner-language'

export const dynamic = 'force-dynamic'

export default async function PracticePage(): Promise<JSX.Element> {
  if (!guidedPracticeEnabled) redirect('/review')
  const { supabase } = await requireUser()
  const { data: profile } = await supabase.from('profiles').select('default_translation_language').single()
  const language = learnerLanguage(profile?.default_translation_language)
  return <AppShell language={language}><div className="page-wrap practice-page"><PracticeSession learnerLanguage={language} /></div></AppShell>
}
