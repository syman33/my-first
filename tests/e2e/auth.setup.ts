import { test as setup } from '@playwright/test'
import { authFile, customers, signIn, signInAdmin } from './support'

/**
 * Signs each test account in once through the real login form and saves the
 * session for the spec files, keeping well under the per-account login limits.
 */

for (const [role, email] of Object.entries(customers)) {
  setup(`sign in ${role} customer`, async ({ page }) => {
    await signIn(page, email)
    await page.context().storageState({ path: authFile(role as keyof typeof customers) })
  })
}

setup('sign in administrator', async ({ page }) => {
  await signInAdmin(page)
  await page.context().storageState({ path: authFile('admin') })
})
