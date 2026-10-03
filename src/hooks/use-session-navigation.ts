'use client'

import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'

/**
 * Navigate after the session changed (sign-in, registration, sign-out).
 * Layouts are kept across client navigations, so the header would still
 * reflect the previous session; `refresh()` re-renders every Server Component
 * with the new cookies. `replace` keeps the auth form out of history.
 *
 * Only pass validated same-site paths (see `postAuthRedirect`).
 */
export function useSessionNavigation(): (href: string) => void {
  const router = useRouter()
  return useCallback(
    (href: string) => {
      router.replace(href as Route)
      router.refresh()
    },
    [router],
  )
}
