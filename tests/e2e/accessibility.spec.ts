import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'
import { addLunaToBag, authFile, products } from './support'

/**
 * Automated accessibility checks (WCAG 2.1 A and AA rules in axe-core) on the
 * key storefront and back-office pages, in both languages. Automated checks
 * catch a subset of issues; they complement keyboard and screen-reader review.
 */

async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const violations = results.violations.map(
    (violation) =>
      `${violation.id} [${violation.impact}] ${violation.help}: ${violation.nodes
        .slice(0, 5)
        .map((node) => node.target.join(' '))
        .join(' | ')}`,
  )
  expect(violations, `Accessibility violations on ${page.url()}`).toEqual([])
}

const publicPages = [
  '/ar',
  '/en',
  '/ar/shop',
  '/ar/bags',
  products.luna.href,
  `/ar/search?q=${encodeURIComponent('لونا')}`,
  '/ar/login',
  '/ar/register',
  '/ar/faq',
  '/ar/contact',
]

for (const path of publicPages) {
  test(`public page ${decodeURIComponent(path)} has no detectable violations`, async ({ page }) => {
    await page.goto(path)
    await expectNoViolations(page)
  })
}

test.describe('customer pages', () => {
  test.use({ storageState: authFile('other') })

  test('bag, checkout and order history have no detectable violations', async ({ page }) => {
    await addLunaToBag(page)
    for (const path of ['/ar/cart', '/ar/checkout', '/ar/account', '/ar/account/orders']) {
      await page.goto(path)
      await expectNoViolations(page)
    }
  })
})

test.describe('back office', () => {
  test.use({ storageState: authFile('admin') })

  test('dashboard, orders, products and inventory have no detectable violations', async ({
    page,
  }) => {
    for (const path of ['/admin', '/admin/orders', '/admin/products', '/admin/inventory']) {
      await page.goto(path)
      await expectNoViolations(page)
    }
  })
})
