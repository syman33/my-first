import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/seo'

// Read the environment at request time: one build is deployed to staging and production.
export const dynamic = 'force-dynamic'

const PRIVATE_PATHS = ['/admin', '/api/']
const PRIVATE_STOREFRONT = [
  'account',
  'checkout',
  'cart',
  'wishlist',
  'search',
  'login',
  'register',
  'forgot-password',
  'reset-password',
  'verify-email',
  'newsletter',
]

export default function robots(): MetadataRoute.Robots {
  const appEnv =
    process.env.APP_ENV ?? (process.env.NODE_ENV === 'production' ? 'production' : 'development')
  // Staging, test and development deployments must never be indexed.
  if (appEnv !== 'production') {
    return { rules: [{ userAgent: '*', disallow: '/' }] }
  }
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          ...PRIVATE_PATHS,
          ...PRIVATE_STOREFRONT.flatMap((path) => [`/ar/${path}`, `/en/${path}`]),
        ],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
  }
}
