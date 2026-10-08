import { expect, test } from '@playwright/test'
import { products } from './support'

/**
 * No broken links (spec §127): every internal link on the main storefront
 * pages, in both languages — header, footer, listings, product page, content
 * pages — must answer without an error.
 */

const START_PAGES = [
  '/ar',
  '/en',
  '/ar/shop',
  '/en/shop',
  products.luna.href,
  '/ar/faq',
  '/ar/contact',
  '/ar/login',
]

test('internal links on the main pages all resolve', async ({ page, request, baseURL }) => {
  test.setTimeout(180_000)
  const origin = new URL(baseURL!).origin
  const links = new Map<string, string>()
  for (const start of START_PAGES) {
    await page.goto(start)
    const hrefs = await page
      .locator('a[href]')
      .evaluateAll((anchors) => anchors.map((anchor) => (anchor as HTMLAnchorElement).href))
    for (const href of hrefs) {
      const url = new URL(href)
      if (url.origin !== origin || url.pathname.startsWith('/api/')) continue
      url.hash = ''
      if (!links.has(url.href)) links.set(url.href, start)
    }
  }
  expect(links.size).toBeGreaterThan(30)

  const broken: string[] = []
  for (const [href, foundOn] of links) {
    const response = await request.get(href, { maxRedirects: 5 })
    if (response.status() >= 400)
      broken.push(`${response.status()} ${href} (linked from ${foundOn})`)
  }
  expect(broken, `Broken links (${broken.length} of ${links.size})`).toEqual([])
})
