'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { BookOpen, Home, LogOut, Settings } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Brand } from './Brand'

const items = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/review', label: 'Review', icon: BookOpen },
  { href: '/words', label: 'Words', icon: BookOpen },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function AppNav() {
  const path = usePathname()
  const router = useRouter()

  async function signOut() {
    await createClient().auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  return (
    <>
      <aside className="sidebar">
        <Brand />
        <nav className="sidebar-links">
          {items.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={`nav-link ${path === href ? 'active' : ''}`}>
              <Icon size={18} strokeWidth={2} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <button className="nav-link nav-button" onClick={signOut}>
          <LogOut size={18} />
          <span>Sign out</span>
        </button>
      </aside>
      <nav className="mobile-nav">
        {items.slice(0, 4).map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={path === href ? 'active' : ''}>
            <Icon size={20} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </>
  )
}
