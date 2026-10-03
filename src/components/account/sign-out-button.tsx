'use client'

import { useState } from 'react'
import { useSessionNavigation } from '@/hooks/use-session-navigation'
import { apiRequest } from '@/lib/client/api'
import { cn } from '@/utils/cn'

interface SignOutButtonProps {
  label: string
  locale: 'ar' | 'en'
  errorMessage: string
  className?: string
}

export function SignOutButton({ label, locale, errorMessage, className }: SignOutButtonProps) {
  const navigate = useSessionNavigation()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function signOut() {
    setPending(true)
    setError(null)
    try {
      await apiRequest('/api/auth/logout', { method: 'POST', locale })
      navigate(`/${locale}`)
    } catch {
      setError(errorMessage)
      setPending(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className={cn('text-start', className)}
        onClick={() => void signOut()}
        disabled={pending}
        aria-busy={pending || undefined}
      >
        {label}
      </button>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </>
  )
}
