import { AppNav } from './AppNav'
import { RouteTransitionFeedback } from './RouteTransitionFeedback'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <AppNav />
      <RouteTransitionFeedback />
      <main className="main-content">{children}</main>
    </div>
  )
}
