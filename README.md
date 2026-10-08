# VÉLORA · فيلورا

A production-grade e-commerce platform for premium women's and men's fashion accessories —
bags, watches, wallets, belts, sunglasses and jewellery — built for Saudi Arabia: Arabic
first (right to left), English second, prices in Saudi riyals with VAT, mada / Apple Pay /
STC Pay / cards and cash on delivery.

Everything is database-driven and real: catalogue, stock, carts, orders, payments, shipping,
returns, refunds, reviews, content and settings live in PostgreSQL and are managed from the
back office. Integrations that need credentials (payment gateway, email, object storage) run
against development stand-ins until configured, and the system says so — it never pretends a
service is connected.

> **Status — code-ready, not yet deployed.** Every check below passes in CI on real
> PostgreSQL. Going live still needs the external accounts listed under
> [Production deployment](#production-deployment): a production database, Moyasar live keys,
> a Resend sending domain, an S3-compatible bucket, monitoring and backups.

---

## Contents

- [Features](#features) · [Architecture](#architecture) · [Tech stack](#tech-stack)
- [Getting started](#getting-started) · [Environment variables](#environment-variables)
- [Database](#database) · [Running and testing](#running-and-testing)
- [Production deployment](#production-deployment) · [Payments](#payments) ·
  [Shipping](#shipping) · [Storage](#storage) · [Administrators](#administrators)
- [Security](#security) · [Backups](#backups-and-restore) · [Troubleshooting](#troubleshooting)
- Deeper docs: [Architecture decisions](docs/decisions.md) ·
  [Operations](docs/operations.md) · [Performance](docs/performance.md)
- For the store owner: [Owner's guide](docs/OWNER_GUIDE.md) ·
  [Verification report](docs/VERIFICATION_REPORT.md)

## Features

**Storefront** — home with editorial banners and product rails; category, gender, new-in,
best-seller and offers listings with filters (category, gender, colour, brand, price, in
stock, on sale) and sorting; search in both languages that understands Arabic spelling variants (hamza, ta
marbuta, the definite article, common synonyms such as شنطة/حقيبة); product
pages with colour/size variants, live stock, gallery, verified-purchase reviews and
structured data; bag with server-side pricing, coupons and free-shipping progress; wishlist
(guests too, merged on sign-in); checkout with saved addresses, standard/express delivery,
online payment or cash on delivery; order confirmation, history, tracking, cancellation,
returns and printable invoices; account, addresses and security; CMS pages, FAQ, contact
form and newsletter. SEO: per-language slugs and metadata, canonical and `hreflang`, Open
Graph, sitemap, robots, Product / Organization / Breadcrumb JSON-LD.

**Back office** (`/admin`, role- and permission-based) — sales dashboard and attention
queue; orders (confirm, prepare, ship with tracking, deliver, cancel, refund, packing slip);
returns (approve, receive and grade, refund pro rata, restock); products, variants, images,
categories, brands; inventory with a full movement ledger and adjustments; customers;
reviews moderation; contact messages; newsletter; coupons; banners; CMS pages and FAQ;
store settings (store details, shipping, payments, COD, checkout, tax, returns, reviews,
social); team invitations and permissions; audit log; notification log with retry; CSV
product import (validated, all-or-nothing) and catalogue / order / subscriber exports.

**Platform** — inventory reservation that cannot oversell; idempotent checkout, returns and
refunds; verified, de-duplicated payment webhooks; transactional outbox for emails;
analytics events with no personal data; audit trail; rate limiting; strict CSP; structured,
redacted logging; health endpoint; scheduled jobs.

## Architecture

```
Browser ──▶ proxy.ts (locale routing, CSRF origin check, CSP nonce, security headers)
              │
              ▼
        Next.js App Router
   ┌──────────┴───────────┐
   Server Components        Route handlers (src/app/api/**)  ◀── webhooks, cron
   (pages, layouts)         apiHandler: auth · permission · rate limit · Zod · errors
   └──────────┬───────────┘
              ▼
        Services (src/services/**)  — all business rules: pricing, stock, orders, payments…
              │            └──▶ Providers: payments (Moyasar | mock), shipping (manual | mock),
              │                 email (Resend | console), storage (S3 | local)
              ▼
        Prisma 7 ──▶ PostgreSQL 16  (constraints, triggers, sequences, indexes)
              ▲
        Outbox worker (after each response + cron) ──▶ notifications
```

- **Business logic lives in services**, never in components or route handlers; UI code is
  forbidden by lint from importing the database or services.
- **The server decides every price, total, stock level, payment status and role.** The
  browser's figures are only displayed.
- Key decisions — authentication, authorization, inventory, the order / payment / shipping /
  refund lifecycles, webhooks, idempotency, configuration — are recorded in
  **[docs/decisions.md](docs/decisions.md)**.

```
src/app          routes: [locale]/… storefront, admin/… back office, api/… JSON + webhooks + cron
src/services     domain services (auth, catalog, cart, orders, payments, inventory, admin, …)
src/lib          cross-cutting: env, auth, permissions, pricing, security, idempotency, logger
src/schemas      Zod validation shared by forms and APIs
src/components   UI (storefront, account, admin) · src/i18n dictionaries (ar, en)
prisma/          schema, SQL migrations, seed (reference + demo)
tests/           unit · integration (real PostgreSQL) · e2e (Playwright)
scripts/         admin:create, jobs, perf benchmark, smoke test, restore drill
```

## Tech stack

| | |
| --- | --- |
| Runtime | Node.js 22 (`.nvmrc`) |
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript (strict) |
| Styling | Tailwind CSS 4, self-hosted IBM Plex Sans Arabic, Cormorant Garamond, Noto Naskh Arabic |
| Data | PostgreSQL 16, Prisma 7 (`@prisma/adapter-pg`) |
| Validation / forms | Zod 4, React Hook Form |
| Security | Argon2id, HMAC-hashed session tokens, nonce-based CSP |
| Images | sharp (upload validation and re-encoding), `next/image` |
| Testing | Vitest (unit + integration), Playwright + axe-core (end-to-end, accessibility) |

Dependencies are pinned to exact versions with a lockfile. CI audits runtime dependencies
(`npm audit --omit=dev`, 0 known vulnerabilities at the time of writing). The remaining
advisories are in ESLint's own tooling (`braces` via `eslint-config-next`), have no fixed
release, and process only this repository's config — not user input.

## Getting started

Requirements: **Node.js 22**, **PostgreSQL 16** (local install or Docker).

```bash
# 1. PostgreSQL (or use your own server)
docker run -d --name velora-db -p 5432:5432 \
  -e POSTGRES_USER=velora -e POSTGRES_PASSWORD=velora_dev_password -e POSTGRES_DB=velora_dev \
  postgres:16

# 2. Dependencies and configuration
npm install
cp .env.example .env
#    then set AUTH_SECRET (openssl rand -base64 48) and MOCK_PAYMENT_WEBHOOK_SECRET (any long string)

# 3. Database
npm run db:migrate:deploy
npm run db:seed            # reference data + demo catalogue, customers, orders and reviews

# 4. Run
npm run dev                # http://localhost:3000 (redirects to /ar)
```

Demo accounts (**development only** — refused by the seed in staging/production, see
[Administrators](#administrators)):

| Role | Email | Password |
| --- | --- | --- |
| Administrator | `admin@velora.local` | `ChangeMe123!` |
| Staff | `staff@velora.local` | `ChangeMe123!` |
| Customers | `noura.alotaibi@example.com` (and 9 more in `prisma/seed/data/people.ts`) | `Customer123!` |

Demo coupons: `VELORA10`, `WELCOME50`, `BAGS15`, `VIP100` (active), `SUMMER25` (expired),
`EID20` (inactive). With the mock payment provider, checkout opens a simulator page where
you choose success, decline or cancel; emails are written to `storage/dev-mail/`.

## Environment variables

All variables are documented in [`.env.example`](.env.example) and validated at startup
(`src/lib/env.ts`). The essentials:

| Variable | Purpose |
| --- | --- |
| `APP_ENV` | `development`, `test`, `staging` or `production` |
| `NEXT_PUBLIC_APP_URL` | Public origin (HTTPS in production); used for links, CSRF checks and secure cookies |
| `DATABASE_URL`, `DATABASE_POOL_MAX` | PostgreSQL connection (pooled URL on serverless) |
| `AUTH_SECRET` | ≥ 32 characters; keys session/token hashing and sealed secrets |
| `CRON_SECRET` | Bearer token for `/api/cron/*` (required in production) |
| `PAYMENT_PROVIDER` + `MOYASAR_*` / `MOCK_PAYMENT_WEBHOOK_SECRET` | `moyasar` or `mock` |
| `SHIPPING_PROVIDER` | `manual` (production) or `mock` |
| `EMAIL_PROVIDER` + `RESEND_API_KEY`, `EMAIL_FROM` | `resend` or `console` |
| `STORAGE_PROVIDER` + `STORAGE_*` | `s3` (any S3-compatible) or `local` |
| `RATE_LIMIT_PROVIDER` | `postgres` (shared across instances) or `memory` (tests) |
| `ANALYTICS_PROVIDER`, `NEXT_PUBLIC_GA_MEASUREMENT_ID` | `none`, `console` or `ga4` |
| `TRUST_PROXY_HEADERS` | `true` behind Vercel or a trusted load balancer |

No secret uses the `NEXT_PUBLIC_` prefix. Never commit `.env`.

## Database

| Command | What it does |
| --- | --- |
| `npm run db:migrate` | Create a migration from schema changes (development only) |
| `npm run db:migrate:deploy` | Apply committed migrations (CI, staging, production) |
| `npm run db:migrate:status` | Show pending migrations |
| `npm run db:validate` | Fail if `schema.prisma` and the migrations disagree |
| `npm run db:seed` | `SEED_PROFILE=reference` (roles, settings, categories, pages — production-safe) or `demo` (default outside staging/production: adds the demo catalogue, accounts and order history created through the real services) |
| `npm run db:reset` | Drop and rebuild a development database |
| `npm run db:studio` | Browse data |

Production uses `migrate deploy` only — never `db push`. Money is stored in integer halalas,
identifiers are UUIDv7, and the database enforces non-negative stock, consistent totals and
an append-only audit log by itself.

## Running and testing

| Command | |
| --- | --- |
| `npm run dev` / `npm run build` / `npm run start` | Develop / production build / serve the build |
| `npm run lint` · `npm run typecheck` · `npm run format:check` | Static checks (zero warnings allowed) |
| `npm run test:unit` | 323 unit tests: pricing, VAT, coupons, money, state machines, validation, security helpers, CSV, analytics, colour contrast… |
| `npm run test:integration` | 168 tests against a real PostgreSQL database (`velora_test`, migrated automatically): auth, authorization and IDOR, checkout, the stock-1 concurrency race, payments and webhooks (signature, duplicate, replay, wrong amount/currency, unknown order), refunds, returns, admin, import/export, the seed |
| `npm test` | Unit + integration |
| `npm run test:e2e` | Playwright against a production build on `velora_e2e` (prepared and seeded automatically): the 19 required customer and admin flows, security headers and access, axe WCAG 2.1 AA checks on 18 pages, analytics events; desktop and phone |
| `npm run test:e2e:ui` | The same, interactively |
| `npm run perf:benchmark` | Query timings at 10k products / 200k orders ([results](docs/performance.md)) |
| `npm run smoke -- <url>` | Read-only post-deploy checks against a running site |
| `npm run db:restore-drill` | Backup → restore → verify ([operations](docs/operations.md#backups-and-restore)) |

Integration and E2E tests use separate databases (`TEST_DATABASE_URL`,
`E2E_DATABASE_URL`, defaulting to `velora_test` / `velora_e2e` on localhost) and refuse to
touch any database whose name does not end in `_test` or `_e2e`.

**CI** (`.github/workflows/ci.yml`) runs on every push and pull request: format, typecheck,
lint, unit tests and dependency audit; migration drift check and integration tests on
PostgreSQL 16; production build; end-to-end tests followed by the smoke test; the query
benchmark; and the backup/restore drill.

## Production deployment

Full guide: **[docs/operations.md](docs/operations.md)** (environments and staging, first
deployment, releasing, rollback, scheduled jobs, monitoring, backups, secret rotation).

Reference stack: **Vercel** (`vercel.json` declares the cron jobs) + managed **PostgreSQL 16**
(Neon, Supabase, RDS…) + **Moyasar** + **Resend** + an **S3-compatible** bucket. In short:

1. Configure the environment from `.env.example` (`APP_ENV=production`, HTTPS URL,
   `AUTH_SECRET`, `CRON_SECRET`, real providers). The server refuses to start in production
   with development providers or missing secrets.
2. `npm run db:migrate:deploy`, then `SEED_PROFILE=reference npm run db:seed`.
3. `npm run admin:create -- --email owner@your-domain --name "Store Owner"`.
4. Deploy, then `npm run smoke -- https://your-domain`.
5. Register the Moyasar webhook and place and refund a real low-value order.

Production readiness is more than a passing build: see the checklist in
[docs/operations.md](docs/operations.md#first-deployment) — staging with sandbox payments,
smoke tests, monitoring alerts and a tested restore are part of going live.

## Payments

Provider interface with **Moyasar** (hosted payment page — VÉLORA never sees or stores card
data) and a **mock** provider for development and tests. Payments are confirmed only by a
verified webhook or a server-side re-check with the provider; the return page proves
nothing. Amount and currency must match the order; duplicates and replays are ignored;
failures release the stock and restore the bag. Configure `MOYASAR_SECRET_KEY`,
`MOYASAR_PUBLISHABLE_KEY`, `MOYASAR_WEBHOOK_SECRET` and register
`https://<domain>/api/webhooks/payments/moyasar` in the Moyasar dashboard.
Details: [decisions §6 and §9](docs/decisions.md#6-payment-lifecycle).

## Shipping

The **manual** provider is production-ready: staff choose the carrier (SMSA, Aramex, SPL,
…) and enter the tracking number; customers get the tracking link by email and on their
order page. Delivery fees, express pricing, free-shipping threshold and COD fee and limits
are store settings. A courier API can be added behind the same interface.

## Storage

Product and review images are validated by content (magic bytes), size- and
dimension-limited, re-encoded with sharp (EXIF, GPS and camera metadata removed) and stored
under content-hash names, never the uploaded file name. `STORAGE_PROVIDER=s3`
works with AWS S3, Cloudflare R2, Supabase Storage or MinIO; `local` writes to
`storage/uploads` and is for development only (refused in production).

## Administrators

- `admin@velora.local` / `ChangeMe123!` exists **only in development data**. The seed
  refuses to create it in staging or production, and a production server logs an alert if
  any `@velora.local` account is active.
- Create the real administrator with `npm run admin:create` (hidden password prompt,
  minimum 12 characters, never accepted on the command line); `--reset` recovers a lost
  administrator; `--suspend-dev-accounts` retires development accounts.
- Invite staff from **Back office → Team** and choose their permissions.

## Security

- Server-side authorization on every admin page and API route; customer data always
  scoped to its owner; administrators cannot lock themselves out.
- Argon2id passwords; HMAC-hashed, revocable sessions in `__Host-` cookies (`httpOnly`,
  `Secure`, `SameSite=Lax`); session lifetimes per role.
- CSRF protection by origin checks on every state-changing request; nonce-based CSP, HSTS,
  `X-Frame-Options: DENY`, `nosniff`, strict referrer and permissions policies.
- Zod validation on every input; prices and totals computed on the server; rate limits on
  sign-in, registration, password reset, checkout, payments, reviews, uploads, exports and
  search.
- Verified, idempotent payment webhooks; idempotent checkout, returns and refunds.
- Uploads validated by content and re-encoded; CSV exports neutralise spreadsheet formulas.
- Logs redact secrets, tokens and link credentials; audit log is append-only in the
  database. Private pages (`/admin`, `/account`, `/checkout`, `/cart`) are `noindex`.
- Report vulnerabilities privately to the repository owner rather than in public issues.

## Backups and restore

Use managed point-in-time recovery plus daily `pg_dump` copies stored with another
provider; restore into a **new** database, verify, then switch. The full procedure, recovery
objectives and the automated drill (`npm run db:restore-drill`, run in CI on every push) are
in [docs/operations.md](docs/operations.md#backups-and-restore).

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Pages return 500 locally with "Can't reach database server" | Start PostgreSQL and check `DATABASE_URL` in `.env`. |
| `Environment validation failed` at startup | The message lists every invalid variable; compare with `.env.example`. |
| Integration tests refuse to run | The test database name must end in `_test`; create `velora_test` (migrations apply automatically). |
| E2E server does not start | Port 3200 busy, or `velora_e2e` missing; set `E2E_DATABASE_URL`. |
| Checkout says the total changed | Prices, stock or a coupon changed since the bag was shown; the page shows the new total to confirm. |
| Emails do not appear in development | Development email is written to `storage/dev-mail/` (and summarised in the server log without secrets). |

More in [docs/operations.md](docs/operations.md#troubleshooting).
