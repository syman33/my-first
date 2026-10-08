/**
 * Post-deployment smoke test: read-only checks against a running deployment.
 *
 *   npm run smoke -- https://staging.velora.example
 *
 * Verifies the app and its database answer, the storefront renders in both
 * languages with real products, security headers are present, private areas
 * are closed and scheduled-job endpoints refuse anonymous calls. Changes
 * nothing, needs no credentials, and exits non-zero on the first failed check
 * so a deploy pipeline can stop (or roll back) on it.
 */

const base = (process.argv[2] ?? process.env.SMOKE_BASE_URL ?? '').replace(/\/$/, '')
if (!/^https?:\/\//.test(base)) {
  console.error('Usage: npm run smoke -- <base URL, e.g. https://staging.velora.example>')
  process.exit(2)
}

interface Check {
  name: string
  run: () => Promise<void>
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function get(path: string, init: RequestInit = {}) {
  return fetch(`${base}${path}`, {
    redirect: 'manual',
    ...init,
    signal: AbortSignal.timeout(15_000),
  })
}

const checks: Check[] = [
  {
    name: 'health: application and database are up',
    run: async () => {
      const response = await get('/api/health')
      const body = (await response.json()) as { status?: string; checks?: { database?: string } }
      assert(response.status === 200, `HTTP ${response.status}`)
      assert(body.status === 'ok' && body.checks?.database === 'ok', JSON.stringify(body))
    },
  },
  {
    name: 'storefront (ar): renders right to left with products and security headers',
    run: async () => {
      const response = await get('/ar')
      const html = await response.text()
      assert(response.status === 200, `HTTP ${response.status}`)
      assert(/<html[^>]+lang="ar-SA"[^>]+dir="rtl"/.test(html), 'missing lang="ar-SA" dir="rtl"')
      assert(html.includes('data-testid="product-card"'), 'no products on the home page')
      const csp = response.headers.get('content-security-policy') ?? ''
      assert(/script-src [^;]*'nonce-/.test(csp), 'CSP without a script nonce')
      assert(response.headers.get('x-frame-options') === 'DENY', 'missing X-Frame-Options: DENY')
      assert(response.headers.get('x-content-type-options') === 'nosniff', 'missing nosniff')
      if (base.startsWith('https://')) {
        assert(response.headers.get('strict-transport-security'), 'missing HSTS on HTTPS')
      }
    },
  },
  {
    name: 'storefront (en): renders left to right',
    run: async () => {
      const response = await get('/en/shop')
      const html = await response.text()
      assert(response.status === 200, `HTTP ${response.status}`)
      assert(/<html[^>]+dir="ltr"/.test(html), 'missing dir="ltr"')
      assert(html.includes('data-testid="product-card"'), 'no products in the shop')
    },
  },
  {
    name: 'SEO: robots.txt and sitemap.xml are served',
    run: async () => {
      const robots = await get('/robots.txt')
      assert(robots.status === 200, `robots.txt HTTP ${robots.status}`)
      const rules = await robots.text()
      console.log(
        `      robots.txt: ${rules.includes('Disallow: /\n') ? 'blocks all (non-production)' : 'production rules'}`,
      )
      const sitemap = await get('/sitemap.xml')
      assert(sitemap.status === 200, `sitemap.xml HTTP ${sitemap.status}`)
      assert((await sitemap.text()).includes('<urlset'), 'sitemap.xml is not a sitemap')
    },
  },
  {
    name: 'access control: the back office and accounts require signing in',
    run: async () => {
      for (const path of ['/admin', '/ar/account', '/ar/checkout']) {
        const response = await get(path)
        assert(
          response.status >= 300 && response.status < 400,
          `${path} answered HTTP ${response.status} without a session`,
        )
        assert(
          (response.headers.get('location') ?? '').includes('/login'),
          `${path} did not redirect to sign-in`,
        )
      }
    },
  },
  {
    name: 'scheduled jobs refuse anonymous calls',
    run: async () => {
      for (const job of ['outbox', 'release-reservations', 'cleanup']) {
        const response = await get(`/api/cron/${job}`)
        assert(response.status === 401, `/api/cron/${job} answered HTTP ${response.status}`)
      }
    },
  },
]

async function main() {
  let failed = 0
  console.log(`Smoke testing ${base}`)
  for (const check of checks) {
    try {
      await check.run()
      console.log(`  ✓ ${check.name}`)
    } catch (error) {
      failed++
      console.error(`  ✗ ${check.name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (failed > 0) {
    console.error(`${failed} of ${checks.length} smoke checks failed`)
    process.exitCode = 1
    return
  }
  console.log(`All ${checks.length} smoke checks passed`)
}

void main()
