'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'

const copy = {
  ar: {
    title: 'حدث خطأ',
    body: 'حدث خطأ غير متوقع أثناء عرض هذه الصفحة. يرجى المحاولة مرة أخرى.',
    retry: 'إعادة المحاولة',
    ref: 'رقم المرجع',
  },
  en: {
    title: 'Something went wrong',
    body: 'An unexpected error occurred while loading this page. Please try again.',
    retry: 'Try again',
    ref: 'Reference',
  },
} as const

/**
 * Route-level error boundary. Shows a friendly message only — the error
 * details are logged server-side (instrumentation.onRequestError) and only
 * the opaque digest is displayed for support reference.
 */
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const params = useParams<{ locale?: string }>()
  const t = params.locale === 'en' ? copy.en : copy.ar

  useEffect(() => {
    // Client-side errors are not visible to server logs; surface them in the console for debugging.
    // eslint-disable-next-line no-console
    console.error(error)
  }, [error])

  return (
    <section
      role="alert"
      className="container-luxe flex min-h-[50vh] flex-col items-center justify-center py-24 text-center"
    >
      <h1 className="font-display text-3xl text-ink md:text-4xl">{t.title}</h1>
      <p className="mt-4 max-w-md text-muted">{t.body}</p>
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
