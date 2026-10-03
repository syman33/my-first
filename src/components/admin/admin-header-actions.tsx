'use client'

import { Languages, LogOut, Store } from 'lucide-react'
import Link from 'next/link'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useSessionNavigation } from '@/hooks/use-session-navigation'
import type { Locale } from '@/i18n/config'
import { apiRequest } from '@/lib/client/api'

/** Language switch, store link and sign-out for the admin header. */
export function AdminHeaderActions({
  locale,
  labels,
}: {
  locale: Locale
  labels: {
    switchLanguage: string
    switchLanguageLabel: string
    viewStore: string
    signOut: string
    signOutError: string
    genericError: string
  }
}) {
  const router = useRouter()
  const navigate = useSessionNavigation()
  const [pending, startTransition] = useTransition()
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const other: Locale = locale === 'ar' ? 'en' : 'ar'

  async function switchLanguage() {
    setError(null)
    try {
      await apiRequest('/api/preferences/locale', { body: { locale: other }, locale })
      startTransition(() => router.refresh())
    } catch {
      setError(labels.genericError)
    }
  }

  async function signOut() {
    setSigningOut(true)
    setError(null)
    try {
      await apiRequest('/api/auth/logout', { method: 'POST', locale })
      navigate(`/${locale}/login`)
    } catch {
      setError(labels.signOutError)
      setSigningOut(false)
    }
  }

  const action =
    'inline-flex h-9 items-center gap-2 px-3 text-sm text-ink transition-colors hover:bg-sand disabled:opacity-50'
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className={action}
        onClick={() => void switchLanguage()}
        disabled={pending}
        aria-label={labels.switchLanguageLabel}
        lang={other}
      >
        <Languages className="size-4" strokeWidth={1.5} aria-hidden="true" />
        <span className="hidden sm:inline">{labels.switchLanguage}</span>
      </button>
      <Link href={`/${locale}` as Route} className={action} target="_blank" rel="noopener">
        <Store className="size-4" strokeWidth={1.5} aria-hidden="true" />
        <span className="hidden sm:inline">{labels.viewStore}</span>
      </Link>
      <button
        type="button"
        className={action}
        onClick={() => void signOut()}
        disabled={signingOut}
        aria-busy={signingOut || undefined}
      >
        <LogOut className="size-4 rtl:-scale-x-100" strokeWidth={1.5} aria-hidden="true" />
        <span className="hidden sm:inline">{labels.signOut}</span>
      </button>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}
