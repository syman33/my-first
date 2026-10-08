# Operations guide

How to deploy, release, monitor, back up and recover VÉLORA. Commands assume the repository
root and Node.js 22.

- [Environments](#environments)
- [Production stack](#production-stack)
- [First deployment](#first-deployment)
- [Releasing a change](#releasing-a-change)
- [Rolling back](#rolling-back)
- [Scheduled jobs](#scheduled-jobs)
- [Monitoring and alerts](#monitoring-and-alerts)
- [Backups and restore](#backups-and-restore)
- [Administrator accounts](#administrator-accounts)
- [Rotating secrets](#rotating-secrets)
- [Troubleshooting](#troubleshooting)

## Environments

| Environment | `APP_ENV` | Database | Providers | Indexed by search engines |
| --- | --- | --- | --- | --- |
| Development | `development` | local `velora_dev` | mock payment and shipping, console email, local storage | no |
| Test (CI) | `test` | disposable `*_test` / `*_e2e` | mock | no |
| Staging | `staging` | its own database (never production's) | **sandbox** payment (Moyasar test keys), real email to a test inbox, S3 bucket | no (`robots.txt` disallows everything) |
| Production | `production` | production database | Moyasar live keys, Resend, S3-compatible storage | yes |

Staging runs the same production build (`NODE_ENV=production`) with `APP_ENV=staging`, so it
exercises the real code paths with sandbox credentials. The demo seed (which creates the
development administrator `admin@velora.local`) refuses to run when `APP_ENV` is `staging` or
`production`.

## Production stack

The application is a standard Next.js server and runs anywhere Node.js 22 runs. The reference
setup:

| Concern | Recommended | Notes |
| --- | --- | --- |
| Hosting | **Vercel** (`vercel.json` included) | Any Node host works: `npm run build && npm run start`. |
| Database | Managed **PostgreSQL 16** — Neon, Supabase, AWS RDS, Crunchy Bridge | Needs the `citext` and `pg_trgm` extensions (created by the first migration). Use the provider's **pooled** connection string for the app and keep `DATABASE_POOL_MAX` low (5–10) on serverless. Choose the app's region next to the database. |
| Payments | **Moyasar** | mada, Visa/Mastercard, Apple Pay, STC Pay via the hosted page. |
| Email | **Resend** | Verified sending domain for `EMAIL_FROM`. |
| Images | Any **S3-compatible** bucket — AWS S3, Cloudflare R2, Supabase Storage | Public-read bucket or CDN in front; set `STORAGE_PUBLIC_BASE_URL` (added to `next/image` and the CSP automatically). |
| Errors / logs | Vercel log drains, Datadog, Better Stack, Sentry… | Logs are structured JSON on stdout; see [Monitoring](#monitoring-and-alerts). |

Every variable is documented in `.env.example` and validated by `src/lib/env.ts`; the server
refuses to start in production with an invalid or unsafe configuration (missing HTTPS,
missing `CRON_SECRET`, development providers, in-memory rate limiting).

## First deployment

1. **Create the database** and two connection strings: pooled (for the app) and direct (for
   migrations, if your provider distinguishes them).
2. **Configure the environment** in the hosting platform from `.env.example`. Generate secrets
   with `openssl rand -base64 48` (`AUTH_SECRET`) and `openssl rand -hex 32` (`CRON_SECRET`).
   Set `APP_ENV=production`, `NEXT_PUBLIC_APP_URL=https://your-domain`,
   `TRUST_PROXY_HEADERS=true` (behind Vercel or a trusted load balancer).
3. **Apply the migrations** against the production database:
   `DATABASE_URL=<direct url> npm run db:migrate:deploy`
4. **Load the reference data** (roles, default settings, category tree, CMS pages — no demo
   data, no accounts): `DATABASE_URL=<url> SEED_PROFILE=reference npm run db:seed`
5. **Create the real administrator** (password typed at a hidden prompt, minimum 12
   characters): `DATABASE_URL=<url> npm run admin:create -- --email owner@your-domain --name "Store Owner"`
6. **Deploy** the application, then **smoke test** it:
   `npm run smoke -- https://your-domain`
7. **Connect Moyasar**: set `MOYASAR_SECRET_KEY`, `MOYASAR_PUBLISHABLE_KEY`,
   `MOYASAR_WEBHOOK_SECRET`; in the Moyasar dashboard add the webhook
   `https://your-domain/api/webhooks/payments/moyasar` with the same secret token. Place a
   real low-value order, refund it from the back office, and check both appear in Moyasar.
8. In the back office: fill **Settings → Store** (legal name, commercial registration, VAT
   number, contact details), **Shipping**, **Payments**, **Checkout**; then add products.

## Releasing a change

1. Open a pull request. **CI** must pass: format, typecheck, lint, unit tests, dependency
   audit, migration drift check, integration tests on PostgreSQL, production build,
   end-to-end tests (including accessibility and broken links) with a smoke test, the query
   benchmark, and the backup/restore drill. Protect `main` so merging requires these checks.
2. Release with the **Release** workflow (Actions → Release → environment), which automates step
   3 below and stops at the first failure: it refuses a commit whose CI is not
   green, applies the migrations, calls the deploy hook, waits until `/api/health` reports
   the new commit, and runs the smoke test. Configure a GitHub Environment per target with
   `MIGRATION_DATABASE_URL` and `DEPLOY_HOOK_URL` secrets and an `APP_URL` variable; give
   `production` required reviewers so a person approves each production release. If your
   host deploys on every push to `main` by itself, turn that off for production so releases
   only go out through this workflow.
3. **Migrations first, code second.** Write migrations to be backward compatible with the
   running code (add columns/tables/indexes; remove only in a later release), then:
   - apply them to **staging**, deploy staging, run `npm run smoke -- <staging url>` and
     walk the critical flows (browse → bag → checkout with the Moyasar sandbox → admin ships
     the order → customer sees it);
   - apply them to **production** (`npm run db:migrate:deploy`), deploy, smoke test.
4. Check `npm run db:migrate:status` reports no pending migrations.

Large tables: `CREATE INDEX` locks writes while it builds. When a table has grown large,
create the index manually with `CREATE INDEX CONCURRENTLY` before deploying, then mark the
migration applied with `npx prisma migrate resolve --applied <migration>`.

## Rolling back

- **Application**: redeploy the previous build (on Vercel, "Promote" the previous
  production deployment — instant, no rebuild). Because migrations are backward compatible,
  the previous code runs against the newer schema.
- **Database**: migrations are not reversed automatically. If a migration itself is wrong,
  write a new forward migration that corrects it. Restore from a backup only for data loss
  or corruption (see below) — it discards everything written since the backup.
- After any rollback, run the smoke test and check the alert stream.

## Scheduled jobs

| Job | Endpoint | Schedule (`vercel.json`) | What it does |
| --- | --- | --- | --- |
| Outbox | `/api/cron/outbox` | every minute | Delivers queued notifications, retries failures with backoff, dead-letters after 8 attempts. |
| Reservations | `/api/cron/release-reservations` | every 5 minutes | Cancels unpaid online orders past the store's hold window and releases their stock. |
| Cleanup | `/api/cron/cleanup` | hourly | Removes expired sessions, tokens, rate-limit windows, idempotency keys and abandoned guest bags. |

Endpoints require `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends it automatically
when `CRON_SECRET` is set) and answer `GET` and `POST`. All jobs are idempotent. Vercel's
Hobby plan runs crons at most daily; use a Pro plan, or any external scheduler calling the
endpoints with the bearer token. Jobs can also be run by hand:
`npm run jobs:run -- outbox|release-reservations|cleanup`.

## Monitoring and alerts

- **Health**: `GET /api/health` → `200 {"status":"ok"}` or `503` when the database is
  unreachable. Point an uptime monitor at it (every minute).
- **Logs**: one JSON object per line on stdout (`level`, `msg`, `requestId`, context).
  Fields holding passwords, tokens, secrets, cookies, authorization headers or card data,
  and secret parameters inside links (reset, verification), are redacted before anything is
  written; customer emails are masked where they are logged.
- **Alerts**: business-critical failures are logged at `warn` with a stable `alert` field.
  Create a log-based alert for each:

  | `alert` | Meaning |
  | --- | --- |
  | `payment.webhook_rejected` | A webhook failed signature verification (misconfiguration or forgery). |
  | `payment.webhook_processing_failed` | A verified webhook could not be applied (the provider will retry). |
  | `payment.amount_mismatch` | The provider reported a different amount/currency; the order needs attention. |
  | `payment.paid_after_cancellation` | Money arrived for a cancelled order — refund it. |
  | `payment.failed`, `refund.failed` | Provider errors. |
  | `order.creation_failed` | Checkout failed unexpectedly. |
  | `shipment.creation_failed` | Shipping a paid order failed. |
  | `notification.delivery_failed`, `outbox.event_dead_lettered` | Customer emails are not going out. |
  | `inventory.reservation_release_failed` | Stock may stay held; check the reservations job. |

- **Errors**: unhandled server errors are logged as `request.unhandled_error` with a digest
  the user also sees. An external tracker (Sentry, Datadog) can be attached in
  `instrumentation.node.ts` with `registerErrorReporter`; context is redacted first.
  Cancelled requests (closed tabs, aborted prefetches) are not reported as errors.
- **Database**: watch connections, slow queries (`pg_stat_statements` where available) and
  storage in the provider's console. `npm run perf:benchmark` measures the hot queries at
  10k products / 200k orders and runs in CI.
- **Back office**: the dashboard surfaces orders needing attention (payment mismatches,
  pending refunds), the notifications log shows failed emails with a retry button, and the
  audit log records every staff action.

## Backups and restore

**Strategy** (a backup is only proven by a restore):

| | |
| --- | --- |
| Continuous | Managed PostgreSQL with **point-in-time recovery** (Neon, Supabase Pro, RDS): restore to any second within the retention window. Enable it. |
| Daily | A logical dump (`pg_dump --format=custom`) to storage in a **different account or provider**, encrypted, kept 30 days; weekly dumps kept 12 weeks. |
| Before risky work | A manual dump before large imports or migrations that rewrite data. |
| Objectives | Recovery point ≤ 5 minutes with PITR (≤ 24 h from dumps alone); recovery time ≤ 1 hour. |
| Images | Enable versioning (or replication) on the storage bucket. |

**Restore procedure**

1. Stop writes: put the site in maintenance (scale to zero or block traffic) so no orders
   are lost between the backup and the switch.
2. Restore into a **new** database — never over the damaged one:
   - PITR: create a branch/restore at the chosen time in the provider's console;
   - dump: `createdb velora_restore && pg_restore --no-owner --no-acl --exit-on-error -d <new url> velora.dump`
3. Verify the copy: `npm run db:migrate:status` (no pending migrations), spot-check recent
   orders, payments and stock in the back office against the provider dashboards.
4. Point `DATABASE_URL` at the restored database, redeploy, run the smoke test, reopen.
5. Reconcile anything after the restore point with the payment provider (payments it
   received that the restored database does not know about) and record what happened.

**Drill.** `npm run db:restore-drill` dumps a database, restores it into an empty one and
verifies it: row counts of every business table, stock on hand equal to the inventory
ledger, the append-only audit trigger and stock constraints still enforced, and the order
number sequence continuing. CI runs it on every push against freshly seeded data; run it
quarterly against a copy of a real backup:

```bash
SOURCE_DATABASE_URL=<copy of a backup> RESTORE_DATABASE_URL=postgresql://…/velora_restore_test npm run db:restore-drill
```

## Administrator accounts

- The development seed creates `admin@velora.local` / `ChangeMe123!` and
  `staff@velora.local` — **development only**. The seed refuses to load them into staging or
  production, and a production server logs `security.dev_accounts_present` at startup if
  any `@velora.local` account is active.
- Create real administrators with `npm run admin:create` (see [First deployment](#first-deployment));
  reset a lost administrator password with `--reset`; retire development accounts with
  `npm run admin:create -- --suspend-dev-accounts`.
- Invite staff from **Back office → Team**: they receive a link to set their own password,
  and administrators choose their permissions.

## Rotating secrets

| Secret | Effect of rotating | How |
| --- | --- | --- |
| `AUTH_SECRET` | Everyone is signed out; outstanding reset/verification links stop working. | Set the new value and redeploy. |
| `CRON_SECRET` | None (update the scheduler if it is external). | Set and redeploy. |
| `MOYASAR_WEBHOOK_SECRET` | Webhooks are rejected until both sides match. | Change in Moyasar and the environment together; the return-page re-check covers the gap. |
| `MOYASAR_SECRET_KEY`, `RESEND_API_KEY`, storage keys | None if the new key is active first. | Create the new key, deploy, then revoke the old one. |

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| Server exits at start with `server.invalid_configuration` | The log lists every invalid variable; fix them in the environment. |
| `/api/health` returns 503 | Database unreachable: connection string, IP allow-list, pool exhausted (lower `DATABASE_POOL_MAX`, use the pooled URL). |
| Orders stay "awaiting payment" after paying | Webhook not reaching the app (check `payment.webhook_rejected`, the URL and secret in Moyasar). The return page re-checks the payment itself; customers can also press "Check again". |
| Emails not arriving | Back office → Notifications shows each attempt and error; check `EMAIL_FROM` domain verification in Resend; retry from there. |
| Stock looks held with no order | Unpaid online orders hold stock for the payment window; the reservations job releases them. Inventory → variant → history shows every movement. |
| Customers signed out unexpectedly | `AUTH_SECRET` changed, or staff session limits (12 h idle). |
| `prisma migrate deploy` fails on an index | A long-running transaction holds a lock; retry off-peak, or build it `CONCURRENTLY` (see [Releasing](#releasing-a-change)). |
| Images do not load in production | `STORAGE_PUBLIC_BASE_URL` missing or wrong; the bucket must allow public reads (or a CDN in front). |
