import { MONOGRAM_FRAME, MONOGRAM_V, WORDMARK_ARABIC, WORDMARK_LATIN } from './logo-data'

/**
 * VÉLORA logo rendered as inline SVG glyph outlines (no font dependency),
 * coloured with `currentColor` so it adapts to its surface. Decorative by
 * default — wrap it in a link/heading that carries the accessible name.
 */

interface LogoProps {
  className?: string
  /** Show the Arabic name فيلورا beneath the Latin wordmark (coloured by `--logo-accent`). */
  withArabic?: boolean
}

export function Monogram({ className }: { className?: string }) {
  const f = MONOGRAM_FRAME
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      <rect
        x={f.x}
        y={f.y}
        width={f.size}
        height={f.size}
        rx={f.rx}
        fill="none"
        stroke="currentColor"
        strokeWidth={f.stroke}
      />
      <path d={MONOGRAM_V} fill="currentColor" />
    </svg>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${Math.ceil(WORDMARK_LATIN.width)} ${WORDMARK_LATIN.height}`}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d={WORDMARK_LATIN.d} fill="currentColor" />
    </svg>
  )
}

export function Logo({ className, withArabic = false }: LogoProps) {
  const gap = 22
  const textX = 64 + gap
  const width = Math.ceil(textX + WORDMARK_LATIN.width + 2)
  const height = 64
  const latinY = withArabic ? 6 : 17
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x={MONOGRAM_FRAME.x}
        y={MONOGRAM_FRAME.y}
        width={MONOGRAM_FRAME.size}
        height={MONOGRAM_FRAME.size}
        rx={MONOGRAM_FRAME.rx}
        fill="none"
        stroke="currentColor"
        strokeWidth={MONOGRAM_FRAME.stroke}
      />
      <path d={MONOGRAM_V} fill="currentColor" />
      <path d={WORDMARK_LATIN.d} fill="currentColor" transform={`translate(${textX} ${latinY})`} />
      {withArabic ? (
        <path
          d={WORDMARK_ARABIC.d}
          fill="var(--logo-accent, var(--color-champagne-strong))"
          transform={`translate(${textX + WORDMARK_LATIN.width - WORDMARK_ARABIC.width} ${40})`}
        />
      ) : null}
    </svg>
  )
}
