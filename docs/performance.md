# Performance

Optimisations are made only where a measurement shows a problem. This page records what was
measured, what changed, and how to measure again.

## How to measure

| What | How |
| --- | --- |
| Database queries at scale | `npm run perf:benchmark` (disposable `*_test` database): builds 10,000 products × 3 variants, 50,000 customers and 200,000 orders × 2 lines, then times the real service functions behind the busiest pages — median and p95 of 15 runs after a warm-up. CI runs it on every push and posts the table to the run summary. |
| Client JavaScript per page | `npm run build`, then sum the gzipped chunks each route's client manifest references (`.next/server/app/<route>/page_client-reference-manifest.js`). |
| Fonts | `.next/server/next-font-manifest.json` lists the files each layout preloads. |
| Real users | Vercel Speed Insights or any RUM tool on Core Web Vitals (LCP, INP, CLS). |

## Findings and changes

### 1. Form pages shipped every Zod locale — fixed (−59 KB gzipped per page)

Every page with a client-validated form (home newsletter, product reviews, sign-in,
registration, checkout, account) loaded an 88 KB (gzipped) chunk containing all of Zod's
error-message translations (Japanese, Polish, German…) and its JSON-schema tooling, none of
which the app uses — messages come from VÉLORA's own dictionaries. Turbopack does not
tree-shake `import { z } from 'zod'`; namespace imports (`import * as z from 'zod'`) do.

| Page (modern browsers, gzipped JS) | Before | After |
| --- | ---: | ---: |
| Home | 252 KB | 193 KB |
| Product | 258 KB | 199 KB |
| Checkout | 258 KB | 199 KB |
| Sign in | 253 KB | 194 KB |
| Shop, bag (no forms) | unchanged | unchanged |

The remaining payload is mostly React DOM and the Next.js App Router runtime (~114 KB),
which every App Router page carries.

### 2. Fonts — preload two weights instead of three (−65 KB of preloaded fonts)

Weight 600 of the sans family was preloaded (Arabic and Latin files) on every page but used
only by nine back-office labels. Those now use 500 and the 600 files were removed:
preloaded fonts per page went from 6 files / 189 KB to 4 files / 124 KB. Display fonts are
not preloaded. All fonts are self-hosted (`next/font/local`, `font-display: swap`, metric-
adjusted fallbacks), so there is no third-party font request.

### 3. Back-office order search — indexed (≈ 640 ms → ≈ 90 ms at 200k orders)

The benchmark showed order search far slower than anything else:

| Query (200,000 orders) | Before | After |
| --- | ---: | ---: |
| Admin orders · search by number | 637.8 ms | 90.1 ms |
| Admin orders · search by email | 669.9 ms | 84.9 ms |

Substring matches (`ILIKE '%…%'`) cannot use B-tree indexes, and the account-email condition
joined `users` inside an `OR`, forcing a scan of every order. Trigram GIN indexes now cover
the order number, email and name, and matching accounts are resolved to a short id list
first so every branch of the `OR` is indexable.

### Everything else — measured, no change needed

| Query | Median (200k orders, 10k products) |
| --- | ---: |
| Shop, page 1 / page 40 | 20 / 23 ms |
| Shop with gender + colour + price filters | 10 ms |
| Search ("product 12", trigram index) | 17 ms |
| Facets for the whole shop / for a search | 61 / 20 ms |
| Product page | 3 ms |
| Customer order history (busiest customer) | 2 ms |
| Admin orders page / status filter | 19 / 10 ms |
| Dashboard (30 days) / top products | 22 / 36 ms |
| Admin customers search / inventory page | 53 / 33 ms |

## Design choices that keep it fast

- **Server rendering by default.** Pages are React Server Components; client components are
  limited to interactive pieces (bag controls, forms, filters drawer, gallery). The
  dictionaries are passed to client components in slices, not whole.
- **Dynamic rendering is deliberate.** Storefront pages render per request because each
  response carries a fresh CSP nonce (strict script policy) and per-shopper bag counts. Hot
  lookups are deduplicated per request with React `cache`.
- **Images** are WebP through `next/image` with explicit `sizes`, so phones download phone-
  sized images; product images are under 40 KB.
- **Pagination everywhere**: listings, admin tables, exports capped (20,000 orders) and
  imports capped (2 MB / 2,000 rows).
- **Indexes match the queries**: product listing by status + category / gender / price /
  sales / rating, trigram search on products and orders, partial indexes for the
  reservation-expiry job and the "needs attention" queue, `(user_id, created_at)` for order
  history.
- **Work after the response**: notification delivery runs after the response is sent
  (outbox), so checkout latency does not include email providers.

## Candidates, not yet justified by evidence

- Settings groups are read with one primary-key lookup each per render (layout + page). A
  per-request cache would save a few sub-millisecond queries; worth doing only if request
  traces show database round trips dominate on the chosen host.
- Whole-shop facets (61 ms) run five aggregates; caching them for a minute would help only
  at much larger catalogues.
