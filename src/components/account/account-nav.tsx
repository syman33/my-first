'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { usePathname } from 'next/navigation'
import { cn } from '@/utils/cn'
import { SignOutButton } from './sign-out-button'

export interface AccountNavItem {
  href: Route
  label: string
  /** Match nested pages too (e.g. order details under orders). */
  nested?: boolean
}

interface AccountNavProps {
  label: string
  items: AccountNavItem[]
  signOut: { label: string; locale: 'ar' | 'en'; errorMessage: string }
}

export function AccountNav({ label, items, signOut }: AccountNavProps) {
  const pathname = usePathname()
  return (
    <nav
      aria-label={label}
      className="-mx-5 overflow-x-auto px-5 lg:mx-0 lg:overflow-visible lg:px-0"
    >
      <ul className="flex gap-6 border-b border-line whitespace-nowrap lg:flex-col lg:gap-0 lg:border-b-0">
        {items.map((item) => {
          const active =
            pathname === item.href || (item.nested === true && pathname.startsWith(`${item.href}/`))
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'block border-b-2 py-3 text-sm transition-colors lg:border-s-2 lg:border-b-0 lg:ps-4',
                  active
                    ? 'border-ink font-medium text-ink'
                    : 'border-transparent text-muted hover:text-ink',
                )}
              >
                {item.label}
              </Link>
            </li>
          )
        })}
        <li className="lg:mt-6 lg:border-t lg:border-line lg:pt-4">
          <SignOutButton {...signOut} className="py-3 text-sm text-muted hover:text-ink lg:ps-4" />
        </li>
      </ul>
    </nav>
  )
}
