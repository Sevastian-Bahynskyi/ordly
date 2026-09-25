'use client'

import Link from 'next/link'
import { useEffect, useState, type CSSProperties } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { BookOpen, Home, LogOut, RotateCcw, Settings } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Brand } from './Brand'
import { useI18n } from './I18nProvider'

const items = [
  { href: '/', label: 'home', icon: Home },
  { href: '/review', label: 'review', icon: RotateCcw },
  { href: '/words', label: 'material', icon: BookOpen },
  { href: '/settings', label: 'settings', icon: Settings },
] as const

export function AppNav() {
  const path = usePathname()
  const router = useRouter()
  const { t } = useI18n()
  const [optimisticPath, setOptimisticPath] = useState(path)

  useEffect(() => {
    setOptimisticPath(path)
  }, [path])

  useEffect(() => {
    items.forEach(({ href }) => {
      if (href !== path) router.prefetch(href)
    })
  }, [path, router])

  async function signOut() {
    await createClient().auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  const activeIndex = Math.max(0, items.findIndex(({ href }) => href === optimisticPath))
  const mobileNavStyle = { '--indicator-x': `${activeIndex * 100}%` } as CSSProperties

  return (
    <>
      <aside className="sidebar">
        <Brand />
        <nav className="sidebar-links">
          {items.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={`nav-link ${path === href ? 'active' : ''}`}>
              <Icon size={18} strokeWidth={2} />
              <span>{t.nav[label]}</span>
            </Link>
          ))}
        </nav>
        <button className="nav-link nav-button" onClick={signOut}>
          <LogOut size={18} />
          <span>{t.nav.signOut}</span>
        </button>
      </aside>
      <nav className="mobile-nav" style={mobileNavStyle} aria-label={t.nav.primary}>
        <span className="mobile-nav-indicator" aria-hidden="true" />
        {items.map(({ href, label, icon: Icon }) => {
          const active = optimisticPath === href
          return (
            <Link
              key={href}
              href={href}
              className={active ? 'active' : ''}
              aria-current={path === href ? 'page' : undefined}
              onPointerDown={() => setOptimisticPath(href)}
              onPointerCancel={() => setOptimisticPath(path)}
              onClick={() => setOptimisticPath(href)}
            >
              <span className="mobile-nav-icon"><Icon size={20} /></span>
              <span>{t.nav[label]}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
