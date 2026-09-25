import { AppShell } from '@/components/AppShell'
import { InstallApp } from '@/components/InstallApp'
import { requireUser } from '@/lib/auth'
import { SettingsForm, SettingsHeader } from '@/components/SettingsForm'
import { learnerLanguage } from '@/lib/learner-language'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const { supabase } = await requireUser()
  const { data: profile } = await supabase.from('profiles').select('*').single()
  const language = learnerLanguage(profile?.default_translation_language)
  return <AppShell language={language}><div className="page-wrap narrow-page"><SettingsHeader />{profile && <SettingsForm profile={profile} />}<InstallApp /></div></AppShell>
}
