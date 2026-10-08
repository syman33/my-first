/**
 * Database seed entry point (`npm run db:seed` / `prisma db seed`).
 *
 * Profiles (SEED_PROFILE):
 *   reference — roles, settings, categories, CMS pages. Safe for production.
 *   demo      — reference + synthetic catalogue, customers, coupons, banners,
 *               newsletter subscribers, development staff accounts, and an
 *               order history (20 orders, 15 reviews) made through the real
 *               checkout, payment, fulfilment, returns and review services.
 *
 * The demo profile (which creates admin@velora.local / ChangeMe123!) is
 * refused when APP_ENV is production or staging.
 */
import { prisma } from '../../src/db/client'
import { seedDemo } from './demo'
import { seedDemoOrders } from './orders'
import { seedReference } from './reference'

const appEnv =
  process.env.APP_ENV ?? (process.env.NODE_ENV === 'production' ? 'production' : 'development')
const profile =
  process.env.SEED_PROFILE ??
  (appEnv === 'production' || appEnv === 'staging' ? 'reference' : 'demo')

async function main(): Promise<void> {
  if (profile !== 'reference' && profile !== 'demo')
    throw new Error(`Unknown SEED_PROFILE "${profile}"`)
  if (profile === 'demo' && (appEnv === 'production' || appEnv === 'staging')) {
    throw new Error(
      'Refusing to load demo data (including development admin credentials) into a production/staging database.',
    )
  }
  console.log(`[seed] profile=${profile} appEnv=${appEnv}`)
  await seedReference(prisma)
  console.log('[seed] reference data ready')
  if (profile === 'demo') {
    await seedDemo(prisma)
    const history = await seedDemoOrders()
    const [products, customers, coupons, orders, reviews] = await Promise.all([
      prisma.product.count(),
      prisma.user.count({ where: { role: 'CUSTOMER' } }),
      prisma.coupon.count(),
      prisma.order.count(),
      prisma.review.count(),
    ])
    console.log(
      `[seed] demo data ready: ${products} products, ${customers} customers, ${coupons} coupons, ${orders} orders (${history.created} new), ${reviews} reviews`,
    )
    console.log('[seed] DEVELOPMENT ONLY admin: admin@velora.local / ChangeMe123!')
  }
}

main()
  .catch((error: unknown) => {
    console.error('[seed] failed:', error)
    process.exitCode = 1
  })
  .finally(() => {
    void prisma.$disconnect()
  })
