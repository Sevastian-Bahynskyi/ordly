import { AppShell } from '@/components/AppShell'

/**
 * The entry page is `force-dynamic`, so it always waits on Supabase. Showing the page frame
 * immediately is what keeps a row tap from feeling frozen (AGENTS.md §16).
 */
export default function EntryLoading(): React.JSX.Element {
  return (
    <AppShell>
      <div className="page-wrap">
        <header className="page-header entry-page-header">
          <div>
            <span className="entry-skeleton entry-skeleton-back" />
            <span className="entry-skeleton entry-skeleton-title" />
            <span className="entry-skeleton entry-skeleton-line" />
          </div>
        </header>
        <section className="composer-card entry-editor-card">
          <span className="entry-skeleton entry-skeleton-field" />
          <span className="entry-skeleton entry-skeleton-field" />
          <span className="entry-skeleton entry-skeleton-field" />
        </section>
      </div>
    </AppShell>
  )
}
