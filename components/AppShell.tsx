import { AppNav } from './AppNav'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <AppNav />
      <main className="main-content">{children}</main>
    </div>
  )
}
