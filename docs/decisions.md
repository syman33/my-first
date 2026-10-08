# Architecture decisions

Short records of the decisions that shape VÉLORA. Each states what was decided, why, and
where it lives, so a change can be weighed against the reason it was made.

1. [Authentication](#1-authentication)
2. [Authorization](#2-authorization)
3. [Database](#3-database)
4. [Inventory](#4-inventory)
5. [Order lifecycle](#5-order-lifecycle)
6. [Payment lifecycle](#6-payment-lifecycle)
7. [Shipping lifecycle](#7-shipping-lifecycle)
8. [Refunds and returns](#8-refunds-and-returns)
9. [Webhooks](#9-webhooks)
10. [Idempotency](#10-idempotency)
11. [Events and notifications](#11-events-and-notifications)
12. [Environment configuration](#12-environment-configuration)
13. [Money, time and language](#13-money-time-and-language)

---

## 1. Authentication

**Decision.** First-party email + password accounts with server-side sessions stored in
PostgreSQL. No third-party identity provider and no JWTs.

- Passwords are hashed with **Argon2id** (19 MiB memory, 2 iterations — the OWASP
  baseline); weaker legacy hashes are rehashed on the next successful login. A policy
  rejects short, very long and common passwords, including ones built from the email.
- A session is a random 256-bit token in an `httpOnly`, `SameSite=Lax` cookie
  (`__Host-velora_session`, `Secure`, on HTTPS). The database stores only an HMAC of the
  token, so a database leak does not yield usable sessions.
- Sessions expire on idle and absolute limits that depend on the role: customers 30 days
  idle / 90 days absolute; staff and administrators 12 hours / 7 days. The session is
  re-read on every request, so suspending an account or changing a role takes effect
  immediately; password changes and resets end the user's other sessions.
- Login issues a fresh token (no session fixation). Login, registration, password reset
  and verification are rate-limited per IP and per account.
- Email verification and password-reset links carry single-use tokens, stored hashed,
  with short expiries.

**Why.** Sessions in the database can be revoked instantly (a stolen JWT cannot), and the
platform has a single web front end, so no token federation is needed.

**Where.** `src/services/auth/`, `src/lib/auth/`, `src/lib/security/tokens.ts`.

## 2. Authorization

**Decision.** Three roles — `CUSTOMER`, `STAFF`, `ADMIN` — plus fine-grained permissions
(e.g. `ORDERS_MANAGE`, `ORDERS_REFUND`, `INVENTORY_ADJUST`) checked on the server for every
back-office page and API route.

- Staff permissions are editable by administrators; `ADMIN_USERS_MANAGE` can never be
  granted to staff, and granting a "manage" permission adds the matching "view".
- Every admin route declares its permission in `apiHandler({ auth: 'staff', permission })`;
  every admin page calls `adminAccess(permission)`. Secondary rights (for example, a product
  import also needs `INVENTORY_ADJUST`) are checked explicitly with `requireAlso`.
- Customer data is always queried with the owner's id in the `WHERE` clause (orders,
  addresses, returns, payments), so another customer's id returns "not found", never data.
- An administrator cannot demote or suspend themselves, which guarantees an active
  administrator remains.

**Where.** `src/lib/auth/permissions.ts`, `src/lib/api/handler.ts`, `src/lib/admin/access.ts`.

## 3. Database

**Decision.** PostgreSQL 16 through Prisma 7 (driver adapter `@prisma/adapter-pg`), with the
database as the single source of truth and its own last line of defence.

- Identifiers are UUIDv7 (time-ordered, index-friendly, not guessable).
- Invariants are enforced by the database as well as the code: `CHECK` constraints for
  non-negative stock, `reserved ≤ on_hand`, order totals that add up, discounts no larger
  than subtotals, valid coupon usage counts; unique constraints for idempotency keys,
  webhook event ids and tracking numbers; an append-only trigger on `audit_logs`.
- Schema changes ship only as reviewed SQL migrations applied with `prisma migrate deploy`.
  `db push` is never used outside throwaway local work. CI fails if the schema and the
  migrations drift apart (`npm run db:validate`).
- Order numbers (`VLR-YYYY-NNNNNN`) and return numbers come from database sequences, so
  they are unique without locking.

**Where.** `prisma/schema.prisma`, `prisma/migrations/`, `src/db/client.ts`.

## 4. Inventory

**Decision.** Each variant has `on_hand` and `reserved`; *available* = `on_hand − reserved`.
Every change is written to an append-only ledger (`inventory_transactions`) with the
before/after values, the reason, the order or return, and who did it.

- **Placing an order reserves stock** with one guarded statement per line —
  `UPDATE inventory SET reserved = reserved + q WHERE on_hand − reserved ≥ q` — inside the
  order's transaction, lines sorted by variant to avoid deadlocks. Two shoppers racing for
  the last unit cannot both win: one update matches, the other matches no row and the
  whole order rolls back with "insufficient stock". The CHECK constraints make a negative
  balance impossible even if code were wrong. (Integration test: stock 1, two concurrent
  checkouts → one success, one refusal, final stock 0.)
- **Confirming the order commits the reservation** (`on_hand` and `reserved` both drop).
- **Cancelling releases** the reservation (or restocks if it was committed); a failed or
  cancelled online payment releases it immediately; unpaid online orders release
  automatically after the store's hold window (default 30 minutes, cron job).
- **Returns restock only units received in sellable condition.**
- Manual adjustments (restock, write-off, stock count) and CSV imports go through the same
  ledger, and can never take stock below what is reserved.

**Where.** `src/services/inventory/inventory.service.ts`, `src/services/admin/inventory.service.ts`.

## 5. Order lifecycle

**Decision.** An explicit state machine; every transition is validated, locked
(`SELECT … FOR UPDATE`), versioned, recorded in the status history and audited.

```
PENDING ─▶ CONFIRMED ─▶ PROCESSING ─▶ SHIPPED ─▶ OUT_FOR_DELIVERY ─▶ DELIVERED ─▶ REFUNDED
   │            │             │
   └────────────┴─────────────┴──▶ CANCELLED
```

- Online orders become `CONFIRMED` when the payment is verified; cash-on-delivery orders
  are confirmed by staff.
- Customers may cancel on their own only in the statuses the store allows (default
  `PENDING` and `CONFIRMED`, never after shipping); cancelling a paid order refunds it.
- Prices, discounts, shipping, COD fee and VAT are computed by one pricing engine on the
  server from database prices; the browser's numbers are never trusted. Checkout sends
  the total the shopper saw only so the server can refuse with "the total changed"
  instead of charging a different amount.

**Where.** `src/lib/orders/state-machine.ts`, `src/services/orders/`, `src/lib/pricing/`.

## 6. Payment lifecycle

**Decision.** A provider interface with two implementations: **Moyasar** (hosted payment
page: mada, Visa/Mastercard, Apple Pay, STC Pay) for production and a **mock** provider for
development and tests. No card data ever touches VÉLORA.

1. Checkout creates the order (`PENDING`, stock reserved) and a `Payment` row.
2. The customer is redirected to the provider's page.
3. The provider reports the result by **webhook** (verified, see 9); the customer's return
   to `/checkout/return` triggers a server-side **re-check with the provider** — arriving
   on the return URL proves nothing.
4. A payment is accepted only if the provider's amount and currency (SAR) match the order;
   a mismatch is flagged for staff attention and alerted, never accepted.
5. Failure or cancellation cancels the order, releases the stock and restores the bag.
6. Money that arrives after an order was cancelled is recorded as paid and flagged for a
   refund — never silently kept.

The mock provider can be enabled in production only behind
`ALLOW_MOCK_PROVIDERS_IN_PRODUCTION`, for closed demos; the storefront then shows a
test-mode banner.

**Where.** `src/services/payments/`.

## 7. Shipping lifecycle

**Decision.** A shipping-provider interface with a **manual** provider (staff enter the
carrier — SMSA, Aramex, SPL, … — and tracking number; production-ready without any API) and
a **mock** provider for development. Courier APIs can be added behind the same interface.

`PROCESSING → SHIPPED` (shipment with carrier and tracking) `→ OUT_FOR_DELIVERY → DELIVERED`.
A tracking number is unique per carrier; tracking links must be HTTPS. Customers see the
carrier, tracking number and link on their order page and in the shipping email.

**Where.** `src/services/shipping/provider.ts`, `src/services/orders/fulfillment.service.ts`.

## 8. Refunds and returns

**Decision.** Refunds are records against a payment: never more than was captured (checked
inside a locked transaction, so concurrent refunds cannot over-refund), with partial refunds
allowed, and idempotent per request key. Online payments are refunded through the provider;
cash-on-delivery refunds are recorded as bank transfers with a reference.

Returns: the customer requests a return within the store's window (default 7 days after
delivery) for delivered items → staff approve or reject (with a reason the customer sees) →
items are received and graded (sellable / damaged) → the refund is computed pro rata from
what was actually paid for those units (discounts included) → sellable units are restocked.
An order becomes `REFUNDED` only when everything paid has been refunded.

**Where.** `src/services/orders/returns.service.ts`, `src/services/payments/payment.service.ts`.

## 9. Webhooks

**Decision.** `POST /api/webhooks/payments/{provider}` trusts nothing until the provider's
signature is verified, then processes each event exactly once.

- Verification first: the mock provider signs `timestamp.body` with HMAC-SHA256 and rejects
  timestamps older than 5 minutes (replay window); Moyasar's `secret_token` is compared in
  constant time. Bodies over 256 KB are refused before reading.
- Every event is stored with a unique `(provider, event_id)`; a duplicate or replayed
  delivery is acknowledged without acting again.
- The event only *triggers* a re-read of the payment state; the order is updated from that
  state in one transaction. Failures return 5xx so the provider retries; rejections and
  failures emit operational alerts.

**Where.** `src/app/api/webhooks/payments/[provider]/route.ts`, `src/services/payments/`.

## 10. Idempotency

**Decision.** Operations that create money movements or orders accept an `Idempotency-Key`
header: checkout, return requests and refunds.

The first request with a key runs and its response is stored (24 hours). A retry with the
same key and the same body replays that response — no second order, reservation or charge.
The same key with a different body is refused (409), and a retry while the first attempt
is still running is asked to wait. A failed attempt releases its key so the customer can
correct and retry. The browser creates one key per checkout attempt and reuses it for
retries of the same submission.

**Where.** `src/lib/idempotency.ts`.

## 11. Events and notifications

**Decision.** A transactional **outbox**: business changes and the events they cause
(`ORDER_PLACED`, `ORDER_SHIPPED`, `PAYMENT_FAILED`, `STAFF_INVITED`, …) are written in the
same database transaction; a worker delivers them afterwards.

- Delivery runs right after the response (no added latency) and every minute by cron for
  retries: events are claimed with `FOR UPDATE SKIP LOCKED` (safe with several instances),
  retried with exponential backoff, and dead-lettered after 8 attempts with an alert.
- Handlers only send notifications and are idempotent per (event, channel, template), so a
  retry never sends twice. Short-lived secrets inside events (e.g. a set-password link)
  are encrypted at rest and erased after delivery.
- Staff can see every notification and retry failed ones from the back office.
- The store's email (Settings → Store) receives an alert for each new order — cash on
  delivery when placed, online orders once paid, the same moment the customer is told —
  and for each return request and contact message. Email is the only channel that sends:
  SMS and WhatsApp are not connected, and no message is sent on them.

**Where.** `src/services/events/`, `src/services/notifications/`.

## 12. Environment configuration

**Decision.** All configuration comes from environment variables validated at startup by
one schema (`src/lib/env.ts`); a misconfigured production instance refuses to start rather
than failing on a customer's checkout.

- `APP_ENV` (`development | test | staging | production`) is separate from `NODE_ENV`, so
  staging runs a production build with staging rules.
- In production: HTTPS is required, `CRON_SECRET` must be set, and development providers
  (mock payment or shipping, console email, local storage, in-memory rate limits) are
  refused unless explicitly allowed for a closed demo.
- Only `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_GA_MEASUREMENT_ID` reach the browser; no secret
  uses the `NEXT_PUBLIC_` prefix. The back office shows which integrations are live,
  simulated or off — never their values.
- At startup in production the app warns loudly if development accounts (`@velora.local`)
  are still active.

**Where.** `src/lib/env.ts`, `src/lib/startup-checks.ts`, `.env.example`.

## 13. Money, time and language

- **Money** is stored and computed in integer halalas (1 SAR = 100 halalas); percentages
  in basis points. No floating point touches an amount. Prices include 15% VAT by default
  (configurable), and the VAT share is shown on the bag, checkout and invoice.
- **Time** is stored in UTC and shown in store time (Asia/Riyadh); date filters and reports
  use store-time day boundaries.
- **Language**: Arabic (RTL) is the primary, default storefront; English (LTR) is complete.
  Every route is prefixed with the locale, both languages have their own slugs, metadata
  and `hreflang` alternates, and all copy comes from typed dictionaries (a missing
  translation is a compile error). Latin digits and the Gregorian calendar are pinned so
  server and browser render identically.

## 14. Queries inside a transaction

A transaction holds one database connection, which runs one query at a time. Independent
reads therefore go through `readAll` (`src/db/client.ts`): in parallel on the pool, one
after another inside a transaction. Firing them concurrently on a transaction connection
gains nothing (the driver only queues them) and the `pg` driver has deprecated it.

Prisma 7.10's own query planner still issues concurrent queries for some nested relation
reads inside a transaction, which shows up as one `pg` deprecation warning per process.
The driver queues these correctly; `@prisma/adapter-pg` pins `pg` to `^8`, so the removal
in `pg@9` cannot arrive without a deliberate Prisma upgrade — check this warning is gone
before taking one.
