'use client'

/**
 * Last-resort boundary for errors thrown by a root layout. It replaces the
 * whole document, so it renders its own <html>/<body> with inline styles and
 * bilingual copy (the locale may be unknown at this point).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          margin: 0,
          background: '#f7f4ef',
          color: '#202020',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <main
          role="alert"
          style={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
            padding: '2rem',
            textAlign: 'center',
          }}
        >
          <div>
            <h1 style={{ fontWeight: 400, fontSize: '2rem', margin: 0 }}>حدث خطأ غير متوقع</h1>
            <p dir="ltr" style={{ color: '#6b6b6b' }}>
              Something went wrong. Please try again.
            </p>
            {error.digest ? (
              <p dir="ltr" style={{ color: '#6b6b6b', fontSize: '0.75rem' }}>
                Ref: {error.digest}
              </p>
            ) : null}
            <button
              type="button"
              onClick={reset}
              style={{
                marginTop: '1.5rem',
                padding: '0.75rem 2rem',
                border: '1px solid #171717',
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              إعادة المحاولة · Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  )
}
