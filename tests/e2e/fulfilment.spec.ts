import { type Browser, expect, type Page, test } from '@playwright/test'
import {
  addLunaToBag,
  authFile,
  definition,
  emptyBag,
  field,
  parseCount,
  signInAdmin,
  t,
} from './support'

/**
 * Required flows 15–19 as one story across two browsers: a customer orders
 * (cash on delivery), the administrator finds the order, moves it through
 * confirmation, preparation and shipping, stock follows every step, and the
 * customer sees the new status.
 */

test.describe.configure({ mode: 'serial' })

/** The default variant of the Luna bag, which the product page pre-selects. */
const SKU = 'VLR-BAG-LUNA-BLK'

async function openStock(admin: Page) {
  await admin.goto(`/admin/inventory?q=${SKU}`)
  await admin.locator('tr', { hasText: SKU }).locator('a[href^="/admin/inventory/"]').click()
  await expect(admin).toHaveURL(/\/admin\/inventory\/[0-9a-f-]{36}$/)
}

async function readStock(admin: Page) {
  const columns = t.admin.inventory.columns
  return {
    onHand: parseCount(await definition(admin, columns.onHand).textContent()),
    reserved: parseCount(await definition(admin, columns.reserved).textContent()),
  }
}

async function stock(admin: Page) {
  await openStock(admin)
  return readStock(admin)
}

async function contexts(browser: Browser) {
  const customer = await browser.newContext({ storageState: authFile('fulfilment') })
  const admin = await browser.newContext({ storageState: authFile('admin') })
  return { customer: await customer.newPage(), admin: await admin.newPage() }
}

test('flow 15: the back office requires signing in, and the administrator can sign in', async ({
  page,
}) => {
  const response = await page.goto('/admin')
  expect(response?.url()).toMatch(/\/ar\/login\?next=%2Fadmin/)
  await signInAdmin(page)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('navigation').first()).toBeVisible()
})

test('flows 16–19: an order moves from placement to shipping and stock follows', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const { customer, admin } = await contexts(browser)
  const before = await stock(admin)

  // The customer orders one Luna bag, paying cash on delivery.
  await emptyBag(customer)
  await addLunaToBag(customer)
  await customer.goto('/ar/checkout')
  await customer.locator('input[name="payment"][value="COD"]').check()
  await expect(customer.locator('[aria-busy="true"]')).toHaveCount(0)
  await customer.getByTestId('place-order').click()
  await customer.waitForURL(/\/ar\/checkout\/confirmation\//)
  const orderNumber = decodeURIComponent(customer.url().split('/').pop() ?? '')
  await expect(customer.getByTestId('confirmation-next')).toHaveText(t.orders.confirmation.codNext)

  // Placing the order reserves the unit without touching on-hand stock.
  expect(await stock(admin)).toEqual({ onHand: before.onHand, reserved: before.reserved + 1 })

  // Flow 16: the administrator finds and opens the order.
  await admin.goto(`/admin/orders?q=${encodeURIComponent(orderNumber)}`)
  await admin.getByRole('link', { name: orderNumber }).click()
  const header = admin.getByRole('heading', { level: 1 })
  await expect(header).toContainText(orderNumber)
  await expect(header).toContainText(t.orders.status.PENDING)

  // The team can open the customer's invoice to print it.
  const [invoice] = await Promise.all([
    admin.context().waitForEvent('page'),
    admin.getByRole('link', { name: t.admin.orders.detail.invoice }).click(),
  ])
  await expect(invoice.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(invoice.getByText(orderNumber)).toBeVisible()
  await invoice.close()

  // Flow 17: confirm → prepare → ship.
  const actions = t.admin.orders.actions
  for (const [step, status] of [
    ['confirm', t.orders.status.CONFIRMED],
    ['process', t.orders.status.PROCESSING],
  ] as const) {
    await admin.getByTestId(`action-${step}`).click()
    await admin.getByTestId('action-confirm-step').click()
    await expect(header).toContainText(status)
  }
  await admin.getByTestId('action-ship').click()
  const shipForm = admin.getByTestId('ship-form')
  await field(shipForm, 'note').fill('Handed to courier (E2E)')
  await admin.getByTestId('ship-submit').click()
  await expect(header).toContainText(t.orders.status.SHIPPED)
  await expect(admin.getByText(actions.done).first()).toBeVisible()

  // Flow 18: confirmation committed the unit (on hand −1, reservation released)…
  expect(await stock(admin)).toEqual({ onHand: before.onHand - 1, reserved: before.reserved })

  // …and a manual delivery of 5 units is recorded in the ledger.
  const adjust = admin.getByTestId('adjust-stock-form')
  await field(adjust, 'type').selectOption('RESTOCK')
  await field(adjust, 'quantity').fill('5')
  await field(adjust, 'reason').fill('Supplier delivery (E2E)')
  await admin.getByTestId('adjust-stock-submit').click()
  await expect
    .poll(async () => {
      await admin.reload()
      return (await readStock(admin)).onHand
    })
    .toBe(before.onHand + 4)
  await expect(admin.getByRole('cell', { name: 'Supplier delivery (E2E)' })).toBeVisible()

  // Flow 19: the customer sees the order as shipped.
  await customer.goto('/ar/account/orders')
  const row = customer.getByTestId('orders-list').getByRole('link').filter({ hasText: orderNumber })
  await expect(row).toContainText(t.orders.status.SHIPPED)
  await row.click()
  await expect(customer.getByText(t.orders.status.SHIPPED).first()).toBeVisible()
})
