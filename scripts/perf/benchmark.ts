/**
 * Query performance at production scale (spec §78, Phase 13).
 *
 * Builds a synthetic catalogue and order history far larger than the demo
 * seed in a DISPOSABLE database, then times the real service functions behind
 * the busiest pages. Usage (the database name must end in _test or _e2e):
 *
 *   DATABASE_URL=postgresql://…/velora_perf_test npm run perf:benchmark
 *
 * Prints a table (also appended to $GITHUB_STEP_SUMMARY in CI) and exits
 * non-zero only if a query blows its hard budget — CI timings vary too much
 * for tight thresholds; the medians are the evidence.
 */
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { prisma } from '../../src/db/client'
import { parseListingParams } from '../../src/schemas/catalog'
import { getDashboardSummary, getTopProducts } from '../../src/services/admin/dashboard.service'
import { listCustomers } from '../../src/services/admin/customers.service'
import { listInventory } from '../../src/services/admin/inventory.service'
import { listAdminOrders } from '../../src/services/admin/orders.service'
import { getListingFacets, listProducts } from '../../src/services/catalog/listing.service'
import { getProductPage } from '../../src/services/catalog/product.service'
import { listCustomerOrders } from '../../src/services/orders/order-query.service'
import { addDays } from '../../src/utils/time'
import { seedReference } from '../../prisma/seed/reference'
import { assertDisposableDatabase } from '../db/safety'

const SCALE = {
  products: 10_000,
  variantsPerProduct: 3,
  customers: 50_000,
  orders: 200_000,
  itemsPerOrder: 2,
}
const RUNS = 15
/** Hard budgets (ms, median): generous on purpose; a breach means something is badly wrong. */
const BUDGET = { storefront: 250, admin: 1000 }

async function main() {
  const target = assertDisposableDatabase(process.env.DATABASE_URL)
  console.log(`[perf] preparing ${target}`)
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], { stdio: 'ignore', env: process.env })
  await prisma.$executeRawUnsafe(`DO $$ DECLARE t text; BEGIN
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
    LOOP EXECUTE format('TRUNCATE TABLE %I RESTART IDENTITY CASCADE', t); END LOOP; END $$`)
  await seedReference(prisma)
  const started = performance.now()
  await generate()
  await prisma.$executeRawUnsafe('ANALYZE')
  console.log(`[perf] data generated in ${((performance.now() - started) / 1000).toFixed(1)}s`)

  const [product] = await prisma.$queryRawUnsafe<{ slug: string }[]>(
    `SELECT slug_ar AS slug FROM products WHERE status = 'PUBLISHED' ORDER BY sales_count DESC LIMIT 1`,
  )
  const [busiest] = await prisma.$queryRawUnsafe<{ user_id: string; email: string }[]>(`
    SELECT o.user_id, u.email::text AS email FROM orders o JOIN users u ON u.id = o.user_id
    GROUP BY o.user_id, u.email ORDER BY count(*) DESC LIMIT 1`)
  const slug = product!.slug
  const { user_id: heavyCustomer, email } = busiest!
  const all = { kind: 'all' } as const
  const filters = (raw: Record<string, string>) => parseListingParams(raw, { sort: 'featured' })
  const now = new Date()

  const cases: { name: string; kind: keyof typeof BUDGET; run: () => Promise<unknown> }[] = [
    { name: 'shop · page 1', kind: 'storefront', run: () => listProducts(all, filters({}), 'ar') },
    {
      name: 'shop · page 40',
      kind: 'storefront',
      run: () => listProducts(all, filters({ page: '40' }), 'ar'),
    },
    {
      name: 'shop · gender + colour + price',
      kind: 'storefront',
      run: () =>
        listProducts(
          all,
          filters({ gender: 'women', color: 'black', min: '200', max: '1500', sort: 'price-asc' }),
          'ar',
        ),
    },
    {
      name: 'search · "product 12"',
      kind: 'storefront',
      run: () => listProducts(all, filters({ q: 'product 12' }), 'ar'),
    },
    { name: 'facets · whole shop', kind: 'storefront', run: () => getListingFacets(all, '') },
    { name: 'facets · search', kind: 'storefront', run: () => getListingFacets(all, 'product 12') },
    { name: 'product page', kind: 'storefront', run: () => getProductPage(slug, 'ar') },
    {
      name: 'my orders (busiest customer)',
      kind: 'storefront',
      run: () => listCustomerOrders(heavyCustomer),
    },
    { name: 'admin orders · page 1', kind: 'admin', run: () => listAdminOrders({}, 1, 25) },
    {
      name: 'admin orders · status filter',
      kind: 'admin',
      run: () => listAdminOrders({ status: 'PROCESSING' }, 1, 25),
    },
    {
      name: 'admin orders · search number',
      kind: 'admin',
      run: () => listAdminOrders({ q: 'VLR-2025-012345' }, 1, 25),
    },
    {
      name: 'admin orders · search email',
      kind: 'admin',
      run: () => listAdminOrders({ q: email.slice(0, 12) }, 1, 25),
    },
    { name: 'dashboard · 30 days', kind: 'admin', run: () => getDashboardSummary('30d', now) },
    {
      name: 'dashboard · top products',
      kind: 'admin',
      run: () => getTopProducts(addDays(now, -30), now),
    },
    {
      name: 'admin customers · search',
      kind: 'admin',
      run: () => listCustomers({ q: 'customer4' }, 1, 25),
    },
    { name: 'admin inventory · page 1', kind: 'admin', run: () => listInventory({}, 1, 25) },
  ]

  const rows: string[] = []
  let breaches = 0
  for (const entry of cases) {
    await entry.run() // warm-up (connection, plan cache)
    const times: number[] = []
    for (let i = 0; i < RUNS; i++) {
      const t0 = performance.now()
      await entry.run()
      times.push(performance.now() - t0)
    }
    times.sort((a, b) => a - b)
    const median = times[Math.floor(times.length / 2)]!
    const p95 = times[Math.min(times.length - 1, Math.ceil(times.length * 0.95) - 1)]!
    const over = median > BUDGET[entry.kind]
    if (over) breaches++
    rows.push(
      `| ${entry.name} | ${median.toFixed(1)} | ${p95.toFixed(1)} | ${BUDGET[entry.kind]} | ${over ? '❌' : '✅'} |`,
    )
  }

  const report = [
    `### Query performance at scale`,
    ``,
    `${SCALE.products.toLocaleString('en')} products × ${SCALE.variantsPerProduct} variants, ` +
      `${SCALE.customers.toLocaleString('en')} customers, ${SCALE.orders.toLocaleString('en')} orders ` +
      `× ${SCALE.itemsPerOrder} items; ${RUNS} timed runs after a warm-up.`,
    ``,
    `| Query | Median ms | p95 ms | Budget ms | |`,
    `| --- | ---: | ---: | ---: | --- |`,
    ...rows,
  ].join('\n')
  console.log(report)
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`)
  if (breaches > 0) {
    console.error(`[perf] ${breaches} quer${breaches === 1 ? 'y' : 'ies'} over budget`)
    process.exitCode = 1
  }
}

/** Bulk synthetic data in SQL (seconds, not minutes), satisfying every table constraint. */
async function generate() {
  const { products, variantsPerProduct, customers, orders } = SCALE
  await prisma.$executeRawUnsafe(`
    INSERT INTO brands (id, slug, name_ar, name_en, updated_at)
    SELECT gen_random_uuid(), 'perf-brand-' || g, 'علامة ' || g, 'Brand ' || g, now()
    FROM generate_series(1, 30) g`)

  await prisma.$executeRawUnsafe(`
    INSERT INTO products (id, sku, slug_ar, slug_en, name_ar, name_en, price, min_price, max_price,
      category_id, brand_id, gender, status, published_at, is_featured, sales_count,
      rating_average, rating_count, search_text, created_at, updated_at)
    SELECT gen_random_uuid(), 'PERF-' || g, 'منتج-' || g, 'product-' || g, 'منتج ' || g, 'Product ' || g,
      price, price, price,
      cats.ids[1 + g % array_length(cats.ids, 1)], brands.ids[1 + g % array_length(brands.ids, 1)],
      (ARRAY['WOMEN', 'MEN', 'UNISEX'])[1 + g % 3]::"Gender",
      CASE WHEN g % 10 = 0 THEN 'DRAFT' ELSE 'PUBLISHED' END::"ProductStatus",
      CASE WHEN g % 10 = 0 THEN NULL ELSE now() - (g % 700) * interval '1 day' END,
      g % 20 = 0, (g * 37) % 500, (g * 13) % 501, (g * 7) % 120,
      lower('product ' || g || ' perf-' || g || ' منتج ' || g),
      now() - (g % 700) * interval '1 day', now()
    FROM generate_series(1, ${products}) g,
      (SELECT array_agg(id) AS ids FROM categories WHERE kind = 'STANDARD') cats,
      (SELECT array_agg(id) AS ids FROM brands) brands,
      LATERAL (SELECT 10000 + (g * 7919) % 490000 AS price) p`)

  await prisma.$executeRawUnsafe(`
    INSERT INTO product_variants (id, product_id, sku, name_ar, name_en, color_family, is_active,
      is_default, sort_order, updated_at)
    SELECT gen_random_uuid(), p.id, p.sku || '-' || v, 'لون ' || v, 'Colour ' || v,
      (ARRAY['BLACK', 'BROWN', 'BEIGE', 'GOLD', 'SILVER', 'RED'])[1 + (v + p.sales_count) % 6]::"ColorFamily",
      true, v = 1, v, now()
    FROM products p CROSS JOIN generate_series(1, ${variantsPerProduct}) v
    WHERE p.sku LIKE 'PERF-%'`)

  await prisma.$executeRawUnsafe(`
    INSERT INTO inventory (variant_id, on_hand, reserved, updated_at)
    SELECT id, (sort_order * 17 + length(sku)) % 40, 0, now() FROM product_variants`)

  await prisma.$executeRawUnsafe(`
    INSERT INTO users (id, email, password_hash, name, role, status, locale, created_at, updated_at)
    SELECT gen_random_uuid(), 'customer' || g || '@perf.example', 'not-a-real-hash',
      'عميل ' || g, 'CUSTOMER', 'ACTIVE', 'ar', now() - (g % 900) * interval '1 day', now()
    FROM generate_series(1, ${customers}) g`)

  // Orders and their two lines come from one numbered table so totals always match the lines.
  await prisma.$executeRawUnsafe(`
    CREATE TEMP TABLE perf_orders AS
    SELECT g AS n, gen_random_uuid() AS id,
      ((g * 7919) % ${customers}) AS customer_rank,
      1 + (g * 31) % ${products} AS product_a, 1 + (g * 57) % ${products} AS product_b,
      1 + g % 2 AS qty_a,
      now() - ((g * 13) % 730) * interval '1 day' - (g % 1440) * interval '1 minute' AS placed_at
    FROM generate_series(1, ${orders}) g`)
  await prisma.$executeRawUnsafe(`
    CREATE TEMP TABLE perf_lines AS
    SELECT o.id AS order_id, o.n, line.position, p.id AS product_id, v.id AS variant_id,
      p.sku, p.name_ar, p.name_en, p.price AS unit_price,
      CASE WHEN line.position = 1 THEN o.qty_a ELSE 1 END AS quantity
    FROM perf_orders o
    CROSS JOIN LATERAL (VALUES (1), (2)) AS line(position)
    JOIN products p ON p.sku = 'PERF-' || CASE WHEN line.position = 1 THEN o.product_a ELSE o.product_b END
    JOIN product_variants v ON v.product_id = p.id AND v.is_default`)
  await prisma.$executeRawUnsafe(`
    INSERT INTO orders (id, order_number, user_id, status, payment_status, payment_method,
      inventory_status, shipping_method, currency, locale, subtotal, discount_total, shipping_total,
      cod_fee, tax_total, total, prices_include_tax, tax_rate_bps, shipping_name, shipping_phone,
      shipping_email, shipping_city, shipping_district, shipping_street, shipping_building,
      shipping_postal_code, created_at, updated_at)
    SELECT o.id, 'VLR-2025-' || lpad(o.n::text, 6, '0'), u.id,
      (ARRAY['DELIVERED', 'DELIVERED', 'DELIVERED', 'DELIVERED', 'DELIVERED', 'DELIVERED',
             'SHIPPED', 'PROCESSING', 'CONFIRMED', 'CANCELLED'])[1 + o.n % 10]::"OrderStatus",
      CASE WHEN o.n % 10 = 9 THEN 'CANCELLED' ELSE 'PAID' END::"PaymentStatus",
      (ARRAY['MADA', 'CARD', 'APPLE_PAY', 'STC_PAY', 'COD'])[1 + o.n % 5]::"PaymentMethod",
      CASE WHEN o.n % 10 = 9 THEN 'RELEASED' ELSE 'COMMITTED' END::"OrderInventoryStatus",
      'STANDARD', 'SAR', 'ar', t.subtotal, 0, t.shipping, 0,
      round(t.subtotal * 1500.0 / 11500)::int, t.subtotal + t.shipping, true, 1500,
      u.name, '+9665' || lpad((o.n % 100000000)::text, 8, '0'), u.email::text, 'الرياض', 'العليا',
      'طريق الملك فهد', '1234', '12345', o.placed_at, o.placed_at
    FROM perf_orders o
    JOIN (SELECT id, name, email, row_number() OVER (ORDER BY id) - 1 AS rank FROM users
          WHERE role = 'CUSTOMER') u ON u.rank = o.customer_rank
    JOIN (
      SELECT order_id, sum(unit_price * quantity)::int AS subtotal,
        CASE WHEN sum(unit_price * quantity) >= 29900 THEN 0 ELSE 2500 END AS shipping
      FROM perf_lines GROUP BY order_id
    ) t ON t.order_id = o.id`)
  await prisma.$executeRawUnsafe(`
    INSERT INTO order_items (id, order_id, product_id, variant_id, product_name_ar, product_name_en,
      sku, unit_price, quantity, line_subtotal, discount_amount, tax_amount, line_total, created_at)
    SELECT gen_random_uuid(), l.order_id, l.product_id, l.variant_id, l.name_ar, l.name_en, l.sku,
      l.unit_price, l.quantity, l.unit_price * l.quantity, 0,
      round(l.unit_price * l.quantity * 1500.0 / 11500)::int, l.unit_price * l.quantity, o.created_at
    FROM perf_lines l JOIN orders o ON o.id = l.order_id`)
  await prisma.$executeRawUnsafe('DROP TABLE perf_lines, perf_orders')
}

main()
  .catch((error: unknown) => {
    console.error('[perf] failed:', error)
    process.exitCode = 1
  })
  .finally(() => {
    void prisma.$disconnect()
  })
