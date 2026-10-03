/**
 * Static storefront routes. A category with one of these slugs would be
 * shadowed by the route (`/[locale]/[category]`), so categories may not use them.
 */
export const RESERVED_CATEGORY_SLUGS: ReadonlySet<string> = new Set([
  'account',
  'admin',
  'api',
  'about',
  'cart',
  'checkout',
  'contact',
  'faq',
  'forgot-password',
  'login',
  'newsletter',
  'order',
  'orders',
  'pages',
  'payment',
  'privacy',
  'product',
  'products',
  'register',
  'reset-password',
  'returns',
  'search',
  'shipping',
  'shop',
  'terms',
  'uploads',
  'verify-email',
  'wishlist',
])
