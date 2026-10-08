import { expect, test } from '@playwright/test'
import { interpolate } from '../../src/i18n'
import { addLunaToBag, analyticsEvents, authFile, emptyBag, products, t } from './support'

/** Required flows 6–10: add to bag, change quantity, remove, wishlist and coupons. */

test.use({ storageState: authFile('bag') })
test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
  await emptyBag(page)
})

test('adds a product to the bag and shows it in the header count and the bag', async ({ page }) => {
  await addLunaToBag(page)
  await expect(page.getByTestId('header-cart')).toContainText('1')

  // Analytics saw the view and the add, priced by the server, with no customer data.
  const events = await analyticsEvents(page)
  expect(events.map((event) => event.name)).toEqual(
    expect.arrayContaining(['product_viewed', 'add_to_cart']),
  )
  const added = events.find((event) => event.name === 'add_to_cart')
  expect(added?.item).toMatchObject({ name: products.luna.nameAr, quantity: 1 })
  expect((added?.item as { price: number }).price).toBeGreaterThan(0)
  expect(JSON.stringify(events)).not.toContain('@')
  await page.goto('/ar/cart')
  const line = page.getByTestId('cart-line')
  await expect(line).toHaveCount(1)
  await expect(line).toContainText(products.luna.nameAr)
})

test('changes the quantity and the server re-prices the line', async ({ page }) => {
  await addLunaToBag(page)
  await page.goto('/ar/cart')
  const line = page.getByTestId('cart-line')
  const quantity = line.getByRole('group', { name: t.cart.bag.quantity })
  const lineTotal = async () => (await line.locator('p.ltr-nums').last().textContent())?.trim()

  const single = await lineTotal()
  await quantity.getByRole('button', { name: t.cart.bag.increase }).click()
  await expect(quantity).toContainText('2')
  await expect.poll(lineTotal).not.toBe(single)

  await quantity.getByRole('button', { name: t.cart.bag.decrease }).click()
  await expect(quantity).toContainText('1')
  await expect.poll(lineTotal).toBe(single)
})

test('removes a product from the bag', async ({ page }) => {
  await addLunaToBag(page)
  await page.goto('/ar/cart')
  await page
    .getByRole('button', {
      name: interpolate(t.cart.bag.removeItem, { name: products.luna.nameAr }),
    })
    .click()
  await expect(page.getByTestId('cart-empty')).toBeVisible()
  await expect(page.getByTestId('cart-line')).toHaveCount(0)
})

test('saves a product to the wishlist and removes it again', async ({ page }) => {
  await page.goto(products.luna.href)
  // The product's own heart (related-product cards below have theirs too).
  const toggle = page.locator(
    `[data-testid="wishlist-toggle"][aria-label*="${products.luna.nameAr}"]`,
  )
  if ((await toggle.getAttribute('aria-pressed')) === 'true') {
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  }
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(toggle).toHaveAccessibleName(
    interpolate(t.cart.wishlist.remove, { name: products.luna.nameAr }),
  )

  await page.goto('/ar/wishlist')
  const item = page.getByTestId('wishlist-item').filter({ hasText: products.luna.nameAr })
  await expect(item).toHaveCount(1)
  await item.getByRole('button', { name: t.cart.bag.remove }).click()
  await expect(item).toHaveCount(0)

  await page.goto(products.luna.href)
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
})

test('applies a valid coupon, refuses an expired one, and removes it', async ({ page }) => {
  await addLunaToBag(page)
  await page.goto('/ar/cart')
  const coupon = page.locator('#coupon-code')
  const apply = page.getByRole('button', { name: t.cart.bag.applyCoupon })
  const discountRow = (code: string) =>
    page.getByText(interpolate(t.cart.bag.discount, { code }), { exact: true })

  // Expired (demo coupon SUMMER25): refused, no discount.
  await coupon.fill('SUMMER25')
  await apply.click()
  // (Scoped to <main>: Next.js's route announcer is also role="alert".)
  await expect(page.locator('main').getByRole('alert')).toBeVisible()
  await expect(discountRow('SUMMER25')).toHaveCount(0)

  // 10% off orders from SAR 200 (demo coupon VELORA10): the server computes the discount.
  await coupon.fill('velora10')
  await apply.click()
  await expect(
    page.getByText(interpolate(t.cart.bag.couponApplied, { code: 'VELORA10' })),
  ).toBeVisible()
  await expect(discountRow('VELORA10')).toBeVisible()

  await page.getByRole('button', { name: t.cart.bag.removeCoupon }).click()
  await expect(discountRow('VELORA10')).toHaveCount(0)
})
