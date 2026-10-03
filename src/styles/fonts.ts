import localFont from 'next/font/local'

/**
 * Self-hosted fonts (SIL OFL 1.1, licenses in src/fonts). Loaded via
 * next/font/local so there is no runtime call to a third-party font CDN
 * (privacy + CSP `font-src 'self'`), and CLS is minimised with metric-adjusted
 * fallbacks.
 *
 * - Sans (UI + body, both scripts): IBM Plex Sans Arabic, split into its
 *   Arabic and Latin subsets; the browser falls back per glyph.
 * - Display Latin: Cormorant Garamond (editorial headlines, wordmark).
 * - Display Arabic: Noto Naskh Arabic — the calligraphic-contrast counterpart
 *   of the Latin serif.
 */

export const sansArabic = localFont({
  src: [
    {
      path: '../fonts/ibm-plex-sans-arabic-arabic-400-normal.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../fonts/ibm-plex-sans-arabic-arabic-500-normal.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../fonts/ibm-plex-sans-arabic-arabic-600-normal.woff2',
      weight: '600',
      style: 'normal',
    },
  ],
  variable: '--font-sans-arabic',
  display: 'swap',
  preload: true,
  fallback: ['Tahoma', 'Arial', 'sans-serif'],
})

export const sansLatin = localFont({
  src: [
    {
      path: '../fonts/ibm-plex-sans-arabic-latin-400-normal.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../fonts/ibm-plex-sans-arabic-latin-500-normal.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../fonts/ibm-plex-sans-arabic-latin-600-normal.woff2',
      weight: '600',
      style: 'normal',
    },
  ],
  variable: '--font-sans-latin',
  display: 'swap',
  preload: true,
  fallback: ['Helvetica Neue', 'Arial', 'sans-serif'],
})

export const displayLatin = localFont({
  src: [
    { path: '../fonts/cormorant-garamond-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/cormorant-garamond-latin-400-italic.woff2', weight: '400', style: 'italic' },
    { path: '../fonts/cormorant-garamond-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: '../fonts/cormorant-garamond-latin-600-normal.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-display-latin',
  display: 'swap',
  preload: false,
  adjustFontFallback: 'Times New Roman',
  fallback: ['Georgia', 'Times New Roman', 'serif'],
})

export const displayArabic = localFont({
  src: [
    { path: '../fonts/noto-naskh-arabic-arabic-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/noto-naskh-arabic-arabic-500-normal.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-display-arabic',
  display: 'swap',
  preload: false,
  adjustFontFallback: 'Times New Roman',
  fallback: ['Traditional Arabic', 'Times New Roman', 'serif'],
})

export const fontVariables = [
  sansArabic.variable,
  sansLatin.variable,
  displayLatin.variable,
  displayArabic.variable,
].join(' ')
