import { expect, test } from '@playwright/test'
import { products, t } from './support'

/** Required flow 4: filtering (desktop sidebar filters submit as soon as they change). */

test('filters narrow the listing, live in the URL and survive a reload', async ({ page }) => {
  await page.goto('/ar/shop')
  const filters = page.getByRole('complementary', { name: t.store.listing.filters })
  const cards = page.getByTestId('product-card')
  await expect(cards.filter({ hasText: products.luna.nameAr })).toHaveCount(1)

  // Men's pieces only: the women's Luna bag disappears. (Scoped to the gender group:
  // the "الرجال" category checkbox also contains the word.)
  const men = (scope: typeof filters) =>
    scope
      .getByRole('group', { name: t.store.listing.gender })
      .getByRole('checkbox', { name: t.store.genders.MEN })
  await men(filters).check()
  await expect(page).toHaveURL(/[?&]gender=men/)
  await expect(cards.first()).toBeVisible()
  await expect(cards.filter({ hasText: products.luna.nameAr })).toHaveCount(0)

  await page.reload()
  await expect(
    men(page.getByRole('complementary', { name: t.store.listing.filters })),
  ).toBeChecked()

  // A price ceiling below every product empties the listing and offers a way back.
  await page.goto('/ar/shop?max=1')
  const empty = page.getByTestId('listing-empty')
  await expect(empty).toBeVisible()
  await empty.getByRole('link', { name: t.store.listing.clearAll }).click()
  await expect(cards.first()).toBeVisible()
})
