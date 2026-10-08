import { expect, test } from '@playwright/test'
import { addLunaToBag, authFile, t } from './support'

/**
 * Browser-level security checks. The exhaustive matrix (IDOR, price and
 * quantity tampering, webhooks, roles) lives in the integration suite; these
 * confirm the same protections hold on the running production build.
 */

test('responses carry the security headers', async ({ page }) => {
  const response = await page.goto('/ar')
  const headers = response!.headers()
  expect(headers['content-security-policy']).toMatch(/script-src [^;]*'nonce-/)
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(headers['x-frame-options']).toBe('DENY')
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['referrer-policy']).toBeTruthy()
  expect(headers['x-powered-by']).toBeUndefined()
})

test('guests are sent to sign in before any private page', async ({ page }) => {
  for (const path of ['/ar/account', '/ar/account/orders', '/ar/checkout', '/admin']) {
    await page.goto(path)
    await expect(page).toHaveURL(new RegExp(`/ar/login\\?next=${encodeURIComponent(path)}$`))
  }
})

test('test deployments ask robots not to index anything', async ({ request }) => {
  const robots = await (await request.get('/robots.txt')).text()
  expect(robots).toMatch(/Disallow: \/\s*$/m)
})

test.describe('signed-in customer', () => {
  test.use({ storageState: authFile('security') })

  test('private pages are marked noindex', async ({ page }) => {
    await addLunaToBag(page)
    for (const path of ['/ar/cart', '/ar/checkout', '/ar/account', '/ar/account/orders']) {
      await page.goto(path)
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
    }
  })

  test('a customer cannot open the back office or call its API', async ({ page }) => {
    await page.goto('/admin')
    await expect(page.locator('#forbidden-title')).toBeVisible()
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)

    const api = await page.request.get('/api/admin/export/products')
    expect(api.status()).toBe(403)
    expect(await api.text()).not.toContain('VLR-')
  })

  test('the payment return page is not proof of payment', async ({ page }) => {
    // An unknown or someone else's payment id reveals nothing and confirms nothing.
    const response = await page.goto(
      '/ar/checkout/return?payment=00000000-0000-4000-8000-000000000000',
    )
    expect(response?.status()).toBe(404)
    await expect(page.getByText(t.orders.confirmation.paidNext)).toHaveCount(0)
  })
})
