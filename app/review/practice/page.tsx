import { redirect } from 'next/navigation'
import { guidedPracticeEnabled } from '@/lib/practice-config'
import type { JSX } from 'react'
import { AppShell } from '@/components/AppShell'
import { PracticeSession } from '@/components/PracticeSession'
import { requireUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function PracticePage(): Promise<JSX.Element> {
  if (!guidedPracticeEnabled) redirect('/review')
  await requireUser()
  return <AppShell><div className="page-wrap practice-page"><PracticeSession /></div></AppShell>
}
