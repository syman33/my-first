import { expect, type Locator, type Page } from '@playwright/test'
import ar from '../../src/i18n/dictionaries/ar'

/**
 * Shared helpers for the end-to-end suite. Tests run against a production
 * build backed by a freshly migrated database with the demo seed loaded
 * (`npm run e2e:prepare`), in Arabic — the primary storefront language — and
 * use the real dictionary so a copy change never needs a test change.
 */

export const t = ar

/** Demo seed credentials (prisma/seed/data/people.ts). Development and test only. */
export const ADMIN = { email: 'admin@velora.local', password: 'ChangeMe123!' }
export const CUSTOMER_PASSWORD = 'Customer123!'

/**
 * One demo customer per spec file, so per-account limits (checkout and
 * payment attempts) and cart contents never leak between files.
 */
export const customers = {
  bag: 'reem.alshehri@example.com',
  payments: 'lama.alharbi@example.com',
  fulfilment: 'haifa.alzahrani@example.com',
  security: 'faisal.almutairi@example.com',
  other: 'khalid.alghamdi@example.com',
} as const

/** Saved session for an account, written by auth.setup.ts (gitignored). */
export function authFile(account: keyof typeof customers | 'admin'): string {
  return `tests/e2e/.auth/${account}.json`
}

/** Seeded products with plenty of stock. Arabic slugs are the canonical storefront URLs. */
export const products = {
  luna: {
    nameAr: 'حقيبة لونا الكتفية',
    href: `/ar/product/${encodeURIComponent('حقيبة-لونا-الكتفية')}`,
  },
}

/** Fill a field by its `name` attribute (React Hook Form registers names). */
export function field(scope: Page | Locator, name: string): Locator {
  return scope.locator(`[name="${name}"]`)
}

export async function signIn(page: Page, email: string, password = CUSTOMER_PASSWORD) {
  await page.goto('/ar/login?next=%2Far%2Faccount')
  const form = page.getByTestId('login-form')
  await field(form, 'email').fill(email)
  await field(form, 'password').fill(password)
  await form.locator('button[type="submit"]').click()
  await page.waitForURL('**/ar/account')
}

export async function signInAdmin(page: Page) {
  await page.goto('/admin')
  await page.waitForURL(/\/ar\/login\?next=%2Fadmin/)
  const form = page.getByTestId('login-form')
  await field(form, 'email').fill(ADMIN.email)
  await field(form, 'password').fill(ADMIN.password)
  await form.locator('button[type="submit"]').click()
  await page.waitForURL((url) => url.pathname === '/admin')
}

/** Empty the signed-in customer's bag through the UI, so each test starts from a known state. */
export async function emptyBag(page: Page) {
  await page.goto('/ar/cart')
  const lines = page.getByTestId('cart-line')
  while ((await lines.count()) > 0) {
    const before = await lines.count()
    await lines.first().getByTestId('cart-remove').click()
    await expect(lines).toHaveCount(before - 1)
  }
  await expect(page.getByTestId('cart-empty')).toBeVisible()
}

export async function addLunaToBag(page: Page) {
  await page.goto(products.luna.href)
  await expect(page.getByRole('heading', { level: 1, name: products.luna.nameAr })).toBeVisible()
  await page.getByTestId('add-to-bag').click()
  await expect(page.getByText(t.cart.addToBag.added)).toBeVisible()
}

/** Numbers render with Latin digits and grouping separators; read them back as integers. */
export function parseCount(text: string | null): number {
  const digits = (text ?? '').replace(/[^\d]/g, '')
  if (digits === '') throw new Error(`No number in "${text}"`)
  return Number(digits)
}

/** The value next to a label in an admin definition list (<dt>label</dt><dd>value</dd>). */
export function definition(page: Page, label: string): Locator {
  return page.locator(`xpath=//dt[normalize-space()="${label}"]/following-sibling::dd[1]`)
}
