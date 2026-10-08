import { type Browser, expect, type Page, test } from '@playwright/test'
import { formatMoney } from '../../src/i18n/format'
import { authFile, definition, field, parseCount, t } from './support'

/**
 * The owner's catalogue workflow, entirely through the back office: create a
 * product with its first variant and opening stock, upload its photo, publish
 * it, then change its price and stock — and the storefront follows each step.
 */

test.use({ storageState: authFile('admin') })

const stamp = Date.now().toString(36).toUpperCase()
const item = {
  nameAr: `حقيبة المالك ${stamp}`,
  nameEn: `Owner Tote ${stamp}`,
  sku: `VLR-E2E-${stamp}`,
  variantSku: `VLR-E2E-${stamp}-BLK`,
}
const p = t.admin.products

async function shopperPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext()
  return context.newPage()
}

async function save(admin: Page) {
  await admin.getByTestId('product-save').click()
  await expect(admin.getByText(t.admin.form.saved)).toBeVisible()
}

async function countStock(admin: Page, counted: number) {
  await admin.goto(`/admin/inventory?q=${item.variantSku}`)
  await admin
    .locator('tr', { hasText: item.variantSku })
    .locator('a[href^="/admin/inventory/"]')
    .click()
  const form = admin.getByTestId('adjust-stock-form')
  await field(form, 'type').selectOption('COUNT')
  await field(form, 'quantity').fill(String(counted))
  await field(form, 'reason').fill('جرد آلي للاختبار')
  await admin.getByTestId('adjust-stock-submit').click()
  await expect(form.getByText(t.admin.inventory.done)).toBeVisible()
  await expect
    .poll(async () =>
      parseCount(await definition(admin, t.admin.inventory.columns.onHand).textContent()),
    )
    .toBe(counted)
}

test('the owner adds a product, publishes it, then changes its price and stock', async ({
  page: admin,
  browser,
}) => {
  // 1. Create: product details, pricing, category and the first variant with opening stock.
  await admin.goto('/admin/products/new')
  const form = admin.getByTestId('product-form')
  await field(form, 'nameAr').fill(item.nameAr)
  await field(form, 'nameEn').fill(item.nameEn)
  const generate = form.getByRole('button', { name: p.fields.generate })
  await generate.nth(0).click()
  await generate.nth(1).click()
  await field(form, 'sku').fill(item.sku)
  await field(form, 'descriptionAr').fill('حقيبة جلدية أُنشئت عبر لوحة الإدارة.')
  await field(form, 'descriptionEn').fill('A leather tote created from the back office.')
  await field(form, 'price').fill('1250')
  await field(form, 'compareAtPrice').fill('1500')
  await field(form, 'categoryId').selectOption({ label: 'الشنط' })
  await field(form, 'gender').selectOption('WOMEN')
  await field(form, 'materialAr').fill('جلد طبيعي')
  await field(form, 'materialEn').fill('Genuine leather')
  await field(form, 'variantSku').fill(item.variantSku)
  await field(form, 'variantNameAr').fill('أسود')
  await field(form, 'variantNameEn').fill('Black')
  await field(form, 'colorFamily').selectOption('BLACK')
  await field(form, 'colorNameAr').fill('أسود')
  await field(form, 'colorNameEn').fill('Black')
  await field(form, 'colorHex').fill('#111111')
  await field(form, 'initialStock').fill('5')
  await admin.getByTestId('product-save').click()
  await expect(admin).toHaveURL(/\/admin\/products\/[0-9a-f-]{36}\?created=1$/)
  await expect(admin.getByText(p.created)).toBeVisible()

  const slugAr = await field(admin.getByTestId('product-form'), 'slugAr').inputValue()
  const href = `/ar/product/${encodeURIComponent(slugAr)}`
  const shopper = await shopperPage(browser)

  // 2. A draft is invisible to shoppers, and cannot be published without a photo.
  expect((await shopper.request.get(href, { maxRedirects: 0 })).status()).toBe(404)
  await field(admin.getByTestId('product-form'), 'status').selectOption('PUBLISHED')
  await admin.getByTestId('product-save').click()
  await expect(admin.getByText(t.errors.fields.publishNeedsImage)).toBeVisible()

  // 3. Upload the photo: it is re-encoded server-side and becomes the main image.
  const images = admin.getByTestId('images-manager')
  await admin
    .getByTestId('image-upload')
    .setInputFiles('public/images/products/vlr-bag-amara/blk.webp')
  await expect(images.getByRole('listitem')).toHaveCount(1)
  await expect(images.getByText(p.images.main)).toBeVisible()

  // 4. Publish: the product is live with its price, compare-at price and stock.
  await field(admin.getByTestId('product-form'), 'status').selectOption('PUBLISHED')
  await save(admin)
  await shopper.goto(href)
  await expect(shopper.getByRole('heading', { level: 1, name: item.nameAr })).toBeVisible()
  const main = shopper.getByRole('main')
  await expect(main.getByText(formatMoney(125_000, 'ar'), { exact: true }).first()).toBeVisible()
  await expect(main.locator('del').first()).toContainText(formatMoney(150_000, 'ar'))
  await expect(shopper.getByTestId('add-to-bag')).toBeEnabled()
  await shopper.goto(`/ar/search?q=${encodeURIComponent(item.nameAr)}`)
  await expect(shopper.getByTestId('product-card').filter({ hasText: item.nameAr })).toHaveCount(1)

  // 5. Change the price: the storefront shows the new one immediately.
  await field(admin.getByTestId('product-form'), 'price').fill('1100')
  await save(admin)
  await shopper.goto(href)
  await expect(main.getByText(formatMoney(110_000, 'ar'), { exact: true }).first()).toBeVisible()
  await expect(main.getByText(formatMoney(125_000, 'ar'), { exact: true })).toHaveCount(0)

  // 6. Stock: counting zero sells it out; a restock count brings it back.
  await countStock(admin, 0)
  await shopper.goto(href)
  await expect(shopper.getByTestId('add-to-bag')).toBeDisabled()
  await expect(shopper.getByTestId('add-to-bag')).toHaveText(t.cart.addToBag.soldOut)
  await countStock(admin, 3)
  await shopper.goto(href)
  await expect(shopper.getByTestId('add-to-bag')).toBeEnabled()
  await shopper.context().close()
})
