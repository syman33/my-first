'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { Locale } from '@/i18n/config'
import type { HeaderCategory } from './site-header'

interface MobileMenuProps {
  locale: Locale
  labels: {
    open: string
    close: string
    title: string
    account: string
    login: string
    wishlist: string
    admin: string
    language: string
  }
  categories: HeaderCategory[]
  accountHref: Route
  signedIn: boolean
  isStaff: boolean
  switchLocaleHref: string
}

/**
 * Mobile navigation drawer built on the native <dialog> element: modal
 * focus trapping, Escape to close and an inert background come from the
 * platform, which is more robust than a hand-rolled focus trap.
 */
export function MobileMenu({
  locale,
  labels,
  categories,
  accountHref,
  signedIn,
  isStaff,
  switchLocaleHref,
}: MobileMenuProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const pathname = usePathname()

  // Close after navigating.
  useEffect(() => {
    dialogRef.current?.close()
  }, [pathname])

  const linkClass = 'block py-3 text-lg text-ink transition-colors hover:text-champagne-strong'

  return (
    <>
      <button
        type="button"
        className="inline-flex size-10 items-center justify-center text-ink lg:hidden"
        aria-label={labels.open}
        aria-haspopup="dialog"
        onClick={() => dialogRef.current?.showModal()}
      >
        <Menu className="size-5" strokeWidth={1.5} aria-hidden="true" />
      </button>
      <dialog
        ref={dialogRef}
        aria-label={labels.title}
        className="m-0 h-dvh max-h-dvh w-[min(22rem,88vw)] max-w-none bg-ivory p-0 text-ink backdrop:bg-ink/40 open:flex open:flex-col"
        onClick={(event) => {
          // Clicking the backdrop (the dialog element itself) closes the drawer.
          if (event.target === dialogRef.current) dialogRef.current.close()
        }}
      >
        <div className="flex h-16 items-center justify-between border-b border-line px-5">
          <span className="font-display text-xl">{labels.title}</span>
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center"
            aria-label={labels.close}
            onClick={() => dialogRef.current?.close()}
          >
            <X className="size-5" strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
        <nav aria-label={labels.title} className="flex-1 overflow-y-auto px-5 py-4">
          <ul className="divide-y divide-line">
            <li>
              <Link href={`/${locale}/shop`} className={linkClass}>
                {locale === 'ar' ? 'المتجر' : 'Shop'}
              </Link>
            </li>
            {categories.map((category) => (
              <li key={category.slug}>
                <Link href={`/${locale}/${category.slug}` as Route} className={linkClass}>
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
          <ul className="mt-8 space-y-1 border-t border-line pt-6 text-base">
            <li>
              <Link href={accountHref} className="block py-2">
                {signedIn ? labels.account : labels.login}
              </Link>
            </li>
            <li>
              <Link href={`/${locale}/wishlist`} className="block py-2">
                {labels.wishlist}
              </Link>
            </li>
            {isStaff ? (
              <li>
                <Link href="/admin" className="block py-2">
                  {labels.admin}
                </Link>
              </li>
            ) : null}
            <li>
              <a
                href={switchLocaleHref}
                lang={locale === 'ar' ? 'en' : 'ar'}
                className="block py-2"
              >
                {labels.language}
              </a>
            </li>
          </ul>
        </nav>
      </dialog>
    </>
  )
}
