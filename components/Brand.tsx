'use client'

import Link from 'next/link'
import { useI18n } from './I18nProvider'

export function Brand(): React.JSX.Element {
  const { t } = useI18n()
  return (
    <Link href="/" className="brand" aria-label={t.nav.brandHome}>
      <span className="brand-mark" aria-hidden="true">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
          <path d="M3.5 5.2c3.2-.8 5.8-.2 8.5 1.7v10.6c-2.6-1.8-5.4-2.5-8.5-1.7V5.2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
          <path d="M20.5 5.2c-3.2-.8-5.8-.2-8.5 1.7v10.6c2.6-1.8 5.4-2.5 8.5-1.7V5.2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
          <path d="M12 6.9v10.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      </span>
      <span>ordly</span>
    </Link>
  )
}
