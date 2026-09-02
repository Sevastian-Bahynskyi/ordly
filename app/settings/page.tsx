import { AppShell } from '@/components/AppShell'
import { InstallApp } from '@/components/InstallApp'
import { requireUser } from '@/lib/auth'
import { SettingsForm } from '@/components/SettingsForm'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const { supabase } = await requireUser()
  const { data: profile } = await supabase.from('profiles').select('*').single()
  return <AppShell><div className="page-wrap narrow-page"><header className="page-header"><span className="eyebrow">SETTINGS</span><h1>Make Ordly fit your Danish.</h1><p>Keep the defaults simple. Change only what helps you learn.</p></header>{profile && <SettingsForm profile={profile} />}<InstallApp /></div></AppShell>
}
