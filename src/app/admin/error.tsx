'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { logger } from '@/lib/logger'

// A client error boundary cannot load the dictionaries without shipping them to every
// back-office page, so its few words live here (as in the storefront's error boundary).
const copy = {
  ar: {
    title: 'تعذّر عرض هذه الصفحة',
    body: 'حدث خطأ غير متوقع. لم يُحفظ أي تغيير لم يكتمل. أعد المحاولة، وإذا تكرر الخطأ فأرسل رقم المرجع للدعم الفني.',
    retry: 'إعادة المحاولة',
    ref: 'رقم المرجع',
  },
  en: {
    title: 'This page could not be shown',
    body: 'An unexpected error occurred. Nothing unfinished was saved. Try again, and if it keeps happening send the reference to support.',
    retry: 'Try again',
    ref: 'Reference',
  },
} as const

const noSubscription = () => () => undefined

/** Back-office error boundary: the admin frame stays, details stay in the server log. */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const lang = useSyncExternalStore(
    noSubscription,
    () => document.documentElement.lang,
    () => 'ar',
  )
  const t = lang.startsWith('en') ? copy.en : copy.ar

  useEffect(() => {
    logger.error('client.admin_render_error', {
      message: error.message,
      digest: error.digest ?? null,
    })
  }, [error])

  return (
    <section
      role="alert"
      className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center px-6 py-16 text-center"
    >
      <h1 className="font-display text-3xl text-ink">{t.title}</h1>
      <p className="mt-3 text-text">{t.body}</p>
      {error.digest ? (
        <p className="mt-2 text-xs text-muted">
          {t.ref}: <span className="ltr-nums">{error.digest}</span>
        </p>
      ) : null}
      <button
        type="button"
        onClick={reset}
        className="mt-8 border border-ink px-8 py-3 text-sm text-ink transition-colors hover:bg-ink hover:text-paper"
      >
        {t.retry}
      </button>
    </section>
  )
}
