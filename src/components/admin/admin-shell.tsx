import Link from 'next/link'
import type { ReactNode } from 'react'
import { Monogram } from '@/components/brand/logo'
import type { Dictionary } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { visibleAdminNav } from '@/lib/admin/navigation'
import type { Permission, RoleKey } from '@/generated/prisma/enums'
import { AdminHeaderActions } from './admin-header-actions'
import { AdminMobileNav } from './admin-mobile-nav'
import { AdminNav, type AdminNavGroupView } from './admin-nav'

/**
 * Back-office frame: a dark sidebar (permission-filtered menu), a slim
 * header and the page. The menu is a convenience only; every page and API
 * route enforces its own permission.
 */
export interface AdminShellUser {
  id: string
  name: string
  role: RoleKey
  permissions: readonly Permission[]
}

export function AdminShell({
  user,
  locale,
  dict,
  testMode,
  children,
}: {
  user: AdminShellUser
  locale: Locale
  dict: Dictionary
  testMode: boolean
  children: ReactNode
}) {
  const t = dict.admin
  const groups: AdminNavGroupView[] = visibleAdminNav(user).map((group) => ({
    key: group.group,
    label: t.nav.groups[group.group],
    items: group.items.map((item) => ({
      key: item.key,
      label: t.nav.items[item.key],
      href: item.href,
    })),
  }))

  return (
    <div className="min-h-dvh bg-ivory lg:grid lg:grid-cols-[16rem_1fr]">
      <a
        href="#admin-main"
        className="sr-only z-50 bg-ink px-4 py-2 text-paper focus:not-sr-only focus:absolute focus:start-4 focus:top-4"
      >
        {t.skipToContent}
      </a>
      <aside className="hidden bg-ink lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:overflow-y-auto">
        <Link href="/admin" className="flex items-center gap-3 px-6 py-6 text-paper">
          <Monogram className="size-8 text-champagne" />
          <span className="font-display text-lg tracking-[0.3em]">VÉLORA</span>
        </Link>
        <div className="flex-1 px-3 pb-8">
          <AdminNav groups={groups} label={t.nav.label} />
        </div>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-line bg-paper/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-paper/80 lg:px-8">
          <div className="flex items-center gap-2">
            <AdminMobileNav
              groups={groups}
              labels={{ menu: t.nav.label, open: t.nav.open, close: t.nav.close }}
            />
            <div className="text-sm leading-tight">
              <p className="font-medium text-ink">{user.name}</p>
              <p className="text-xs text-muted">{t.header.roles[user.role]}</p>
            </div>
          </div>
          <AdminHeaderActions
            locale={locale}
            labels={{
              switchLanguage: t.header.switchLanguage,
              switchLanguageLabel: t.header.switchLanguageLabel,
              viewStore: t.header.viewStore,
              signOut: t.header.signOut,
              signOutError: t.header.signOutError,
              genericError: dict.errors.generic,
            }}
          />
        </header>
        {testMode ? (
          <p className="border-b border-warning/30 bg-warning-soft px-4 py-2 text-xs text-warning lg:px-8">
            {t.testMode}
          </p>
        ) : null}
        <main id="admin-main" tabIndex={-1} className="flex-1 px-4 py-8 focus:outline-none lg:px-8">
          {children}
        </main>
      </div>
    </div>
  )
}
