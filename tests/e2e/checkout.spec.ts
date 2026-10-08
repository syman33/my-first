import { expect, type Page, test } from '@playwright/test'
import { interpolate } from '../../src/i18n'
import { addLunaToBag, authFile, definition, emptyBag, products, t } from './support'

/**
 * Required flows 11–14: checkout, a successful and a failed mock payment, and
 * the customer's order history. The mock provider page is the development
 * stand-in for the hosted payment page; the result is always re-checked
 * server-side, never taken from the redirect.
 */

test.use({ storageState: authFile('payments') })
test.describe.configure({ mode: 'serial' })

/** Bag → checkout with the saved default address → card payment → the provider's page. */
async function checkoutWithCard(page: Page) {
  await emptyBag(page)
  await addLunaToBag(page)
  await page.goto('/ar/cart')
  await page.getByRole('link', { name: t.cart.bag.checkout }).click()
  await expect(page).toHaveURL(/\/ar\/checkout$/)

  // The default address is pre-selected; choose card payment and wait for the server re-price.
  await expect(page.locator('input[name="address"]:checked')).toHaveCount(1)
  await page.locator('input[name="payment"][value="CARD"]').check()
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
  const placeOrder = page.getByTestId('place-order')
  await expect(placeOrder).toHaveText(t.checkout.placeOrderPay)
  await expect(placeOrder).toBeEnabled()
  await placeOrder.click()

  await page.waitForURL(/\/ar\/payment\/mock\//)
  await expect(page.getByText(t.checkout.mock.notice)).toBeVisible()
}

test('checkout and a successful payment confirm the order', async ({ page }) => {
  await checkoutWithCard(page)
  await page.getByTestId('mock-pay-success').click()

  await page.waitForURL(/\/ar\/checkout\/confirmation\//)
  const orderNumber = decodeURIComponent(page.url().split('/').pop() ?? '')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.orders.confirmation.title)
  await expect(
    page.getByText(interpolate(t.orders.confirmation.received, { number: orderNumber })),
  ).toBeVisible()
  await expect(page.getByTestId('confirmation-next')).toHaveText(t.orders.confirmation.paidNext)

  // The bag was converted into the order.
  await page.goto('/ar/cart')
  await expect(page.getByTestId('cart-empty')).toBeVisible()

  // Flow 14: order history shows it, and the detail page shows it paid.
  await page.goto('/ar/account/orders')
  const row = page.getByTestId('orders-list').getByRole('link').filter({ hasText: orderNumber })
  await expect(row).toHaveCount(1)
  await row.click()
  await expect(page).toHaveURL(/\/ar\/account\/orders\/[0-9a-f-]{36}$/)
  await expect(
    page.getByText(`${t.orders.detail.paymentStatus}: ${t.orders.paymentStatus.PAID}`),
  ).toBeVisible()
  await expect(page.getByText(products.luna.nameAr).first()).toBeVisible()
})

test('a declined payment leaves the order unpaid, releases it and restores the bag', async ({
  page,
}) => {
  await checkoutWithCard(page)
  const orderNumber = (await definition(page, t.checkout.mock.order).textContent())?.trim()
  expect(orderNumber).toMatch(/\d/)
  await page.getByTestId('mock-pay-failed').click()

  await page.waitForURL(/\/ar\/checkout\/return\?payment=/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.checkout.return.failedTitle)
  await expect(page.getByTestId('payment-return-status')).toHaveText(t.checkout.return.failed)

  // The pieces are back in the bag for another try.
  await page.getByRole('link', { name: t.checkout.return.backToBag }).click()
  await expect(page.getByTestId('cart-line').filter({ hasText: products.luna.nameAr })).toHaveCount(
    1,
  )

  // History: the order exists, unpaid and cancelled (never "paid").
  await page.goto('/ar/account/orders')
  const row = page.getByTestId('orders-list').getByRole('link').filter({ hasText: orderNumber! })
  await expect(row).toContainText(t.orders.status.CANCELLED)
  await row.click()
  await expect(
    page.getByText(`${t.orders.detail.paymentStatus}: ${t.orders.paymentStatus.FAILED}`),
  ).toBeVisible()
  await expect(page.getByTestId('pay-order')).toHaveCount(0)
})
