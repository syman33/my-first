# VÉLORA — Verification report

Date: 2026-10-08. Everything below was **run**, not read from the code:
- a local PostgreSQL 16;
- the development server;
- a production build (`next build && next start`);
- the automated suites.

The owner-facing companion is [`OWNER_GUIDE.md`](OWNER_GUIDE.md).

## A. System status

PASS = run and working. MOCK = a development stand-in that moves no money and sends
nothing. NOT CONFIGURED = code exists but no credentials, or not built at all.

| Area | Status | Evidence |
| --- | --- | --- |
| Database: connection, migrations, drift | PASS | `prisma migrate deploy` on an empty database. Status up to date. Drift check in sync. `/api/health` reports the database OK. |
| Seed: demo (development) and reference (production) | PASS | Demo: 10 products, customers, 20 orders through real services. Reference on an empty database: 12 categories, 9 settings groups, 3 roles, 5 pages, 0 products, 0 orders. The demo seed is refused with `APP_ENV=production`. |
| No hard-coded data or fallbacks | PASS | The storefront reads the database on every request. Admin changes to price and stock show immediately (E2E). |
| Storefront (Arabic RTL / English LTR) | PASS | All routes 200. Unknown product or category returns a true 404. Cross-language slugs return 308. Accessibility (axe) clean on 12 pages. |
| Customer journey | PASS | E2E: browse, filter, search, bag, coupon, wishlist, checkout, payment success and decline, order history. |
| Owner product workflow | PASS | New E2E: create → draft hidden (404) → publish refused without a photo → upload → publish → storefront price and compare-at → search → price edit → stock 0 shows sold out → restock. |
| Image upload | PASS | Re-encoded to WebP. EXIF/GPS stripped. Type sniffed from the bytes. Limit 8 MB, minimum 600 px. |
| Inventory and last-item race | PASS | Live HTTP race: 2 customers, 1 unit → 200 and 409 `INSUFFICIENT_STOCK`; available never below 0; ledger complete. Integration: 2-for-1 and 8-for-3 races. Database CHECK constraints. |
| Orders lifecycle (admin) | PASS | E2E: find → confirm → process → ship → stock follows → customer sees "Shipped". |
| Invoice (customer and admin) | PASS | Customer's own invoice; the admin can now open and print it; a customer on the admin URL gets the 403 view. |
| Order alerts to the store | PASS (MOCK delivery) | New in this round. Integration-tested: one alert per order, sent to the store email; none for unpaid orders. Delivery needs Resend. |
| Auth and roles | PASS | 52 live checks (see C). |
| Payments | MOCK | Simulator only. Moyasar code written, no keys, never run against a real Moyasar account. |
| Payment proof | PASS | A forged "paid" return URL left the order PENDING. Webhook signature, replay, amount and currency checks are in integration tests. |
| Shipping | MOCK (development) / manual (production) | No courier API. Staff enter the carrier and tracking number; tracking links for SPL, SMSA and Aramex. |
| Email | MOCK | Console provider: recorded in the notifications log, not delivered. Resend code exists, no key. |
| SMS / WhatsApp | NOT CONFIGURED | No provider and no sending code paths. Nothing is sent. |
| Image storage | MOCK (local) | S3-compatible provider exists, no bucket configured. Production refuses local storage. |
| ZATCA e-invoicing | NOT CONFIGURED (not built) | The invoice states it is not a ZATCA e-invoice. |
| Analytics | Off | GA4 provider exists; not configured. |
| Production safety | PASS | A production server with mock or console or local providers **refused to start** and listed each reason. |
| Owner account provisioning | PASS | `admin:create` on a database copy: Argon2id hash, weak password refused, dev accounts suspended. |
| Automated suites | PASS | Format, lint, typecheck; unit 324/324; integration 169/169; E2E 45/45 (desktop and mobile Chromium); production build. |

## B. Ready now (no external setup)

The full back office:
- products, variants, photos, prices, stock with history;
- orders with confirm, ship, deliver, cancel and refund;
- returns, customers, coupons, banners, pages, FAQ, reviews, messages;
- settings, staff and permissions, audit log, notifications log, import and export.

The full storefront in Arabic and English. Cash on delivery works end to end with manual
shipping, and needs no payment company.

## C. Security checks run against the live server

**Sign-in**
- Wrong password and unknown email return the same 401.
- Login without an Origin header, or from a foreign origin, returns 403.
- Repeated logins return 429.
- The session cookie is HttpOnly.
- After logout, the old cookie is rejected.

**Customer**
- 403 on create or edit product, stock, refund, settings, staff, role permissions and export.
- `/admin` shows the 403 view with no admin data.
- Another customer's order, order cancel, and address read, edit and delete all return 404, and the data is unchanged.
- Smuggling `role: "ADMIN"` in a profile update returns 422, and the role is unchanged.

**Staff**
- Orders and stock allowed.
- Refund, product edit, settings, staff management, self-promotion and editing their own account all return 403.

**Admin**
- No password hashes in pages or exports.
- No secret values on the settings page.

## D. Fixed in this verification round

1. Independent reads inside transactions no longer run concurrently on one connection (the pg deprecation). A remaining warning comes from Prisma's own query planner; it is documented.
2. The store email now receives a **new-order alert**. Before, it only received returns and contact messages.
3. The team can open and print an order's **invoice** from the back office.
4. The back office links to the signed-in user's **password page**. Header labels stay accessible on phones.
5. Settings copy: the store email says what it receives. The VAT hint no longer states a legal rule as fact.
6. New E2E: the owner catalogue workflow, and the admin invoice step.

## E. Known limitations (not defects)

- A non-staff user on `/admin` sees the 403 view with HTTP status 200. The page is
  noindex and has no data. A true 403 status needs Next.js's experimental `forbidden()`.
- No low-stock email: the dashboard lists low stock.
- No courier, SMS, WhatsApp or ZATCA integration.
- Moyasar is untested against a real account until keys exist.
