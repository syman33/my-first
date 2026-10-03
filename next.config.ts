import type { NextConfig } from 'next'

const isProd = process.env.NODE_ENV === 'production'

/**
 * Remote image hosts are derived from configuration, never hardcoded:
 * the storage provider's public base URL (S3/R2/Supabase/Cloudinary/CDN).
 */
function storageRemotePatterns(): NonNullable<NextConfig['images']>['remotePatterns'] {
  const base = process.env.STORAGE_PUBLIC_BASE_URL
  if (!base) return []
  try {
    const url = new URL(base)
    const protocol = url.protocol.replace(':', '')
    if (protocol !== 'https' && protocol !== 'http') return []
    return [
      {
        protocol,
        hostname: url.hostname,
        port: url.port,
        pathname: `${url.pathname.replace(/\/$/, '')}/**`,
      },
    ]
  } catch {
    throw new Error(`STORAGE_PUBLIC_BASE_URL is not a valid URL: ${base}`)
  }
}

/**
 * Static security headers for every response. The Content-Security-Policy for
 * HTML documents is nonce-based and therefore generated per request in
 * `src/proxy.ts`; API routes get a restrictive policy here.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), browsing-topics=(), interest-cohort=()',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  ...(isProd
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
    : []),
]

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  images: {
    formats: ['image/avif', 'image/webp'],
    qualities: [75, 90],
    remotePatterns: storageRemotePatterns(),
    localPatterns: [
      { pathname: '/images/**', search: '' },
      { pathname: '/uploads/**', search: '' },
      { pathname: '/brand/**', search: '' },
    ],
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        source: '/api/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "default-src 'none'; frame-ancestors 'none'" },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
    ]
  },
}

export default nextConfig
