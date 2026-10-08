import { expect, test } from '@playwright/test'
import { products, t } from './support'

/**
 * Required flows 1, 2, 3 and 5: homepage, browsing, search and the product
 * page. Runs on desktop and on a phone viewport (smoke).
 */

test('homepage renders in Arabic, right to left, with real catalogue products', async ({
  page,
}) => {
  const response = await page.goto('/ar')
  expect(response?.status()).toBe(200)
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar-SA')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByTestId('product-card').first()).toBeVisible()
  await expect(page).toHaveTitle(/VÉLORA/)
})

test('browsing the shop lists products and opens a product page', async ({ page }) => {
  await page.goto('/ar/shop')
  const cards = page.getByTestId('product-card')
  await expect(cards.first()).toBeVisible()
  expect(await cards.count()).toBeGreaterThan(4)

  const first = cards.first()
  const name = (await first.getByRole('heading').first().textContent())?.trim()
  expect(name).toBeTruthy()
  await first.getByRole('link').first().click()
  await expect(page).toHaveURL(/\/ar\/product\//)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name!)
})

test('search finds products by Arabic name and explains an empty result', async ({ page }) => {
  await page.goto('/ar/search')
  const box = page.locator('#search-page-input')
  await box.fill('لونا')
  await box.press('Enter')
  await expect(page).toHaveURL(/\/ar\/search\?q=/)
  await expect(
    page.getByTestId('product-card').filter({ hasText: products.luna.nameAr }),
  ).toBeVisible()

  await page.goto(`/ar/search?q=${encodeURIComponent('زرافة-غير-موجودة')}`)
  await expect(page.getByTestId('listing-empty')).toBeVisible()
  await expect(page.getByTestId('product-card')).toHaveCount(0)
})

test('product page shows price, options, stock and structured data', async ({ page }) => {
  const response = await page.goto(products.luna.href)
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(products.luna.nameAr)
  await expect(page.getByTestId('product-price')).toContainText(/\d/)
  await expect(page.getByTestId('stock-status')).toBeVisible()
  await expect(page.getByTestId('add-to-bag')).toBeEnabled()
  await expect(page.getByTestId('add-to-bag')).toHaveText(t.cart.addToBag.add)

  const jsonLd = await page.locator('script[type="application/ld+json"]').allTextContents()
  const graph = jsonLd.map((text) => JSON.parse(text) as Record<string, unknown>)
  expect(graph.some((entry) => entry['@type'] === 'Product')).toBe(true)
})
