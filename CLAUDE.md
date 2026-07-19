# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

**Implementation is complete** (all Phases 0–6 in `tasks/todo.md` done; engine verified by
script). SunPay is a hackathon **group payment engine**. The authoritative spec is
`sunpay_implementation_plan_v3 (1).md` — when changing behavior, reconcile against it (sections
are cited throughout the code as `§N`). What remains is human-only: fill `app/seed/auth0-users.json`
with 3 real Auth0 users (or rely on email auto-link), run a browser pass of the §10 demo, and
enable TOTP MFA in the Auth0 tenant for the step-up beat.

Deliberate deviations from the spec already made (see `tasks/todo.md` review): the decline card is
`pm_card_chargeCustomerFail` (not `pm_card_visa_chargeDeclined`, which declines at attach); seed
users are the user's 3 real Auth0 accounts, not literal Alice/Bob/Carol; the engine core lives in
`src/lib/engine.ts` so routes and verification scripts share one implementation.

**The spec makes binding decisions — do not substitute alternatives.** Specifically: do not
swap SQLite for Postgres, do not add an ORM, do not add webhooks (the Stripe flow is
synchronous/off-session), do not add a job queue. The goal is a working end-to-end localhost
demo where every screen is wired to a real backend — not production financial infrastructure.
Keep security "barebones-but-real" and do not exceed the security list in the spec's §7.

## What SunPay is

A **group payment engine**. One person checks out for a group purchase; each group member is
charged their share off a saved card; the merchant is paid in full immediately. If a member's
card declines (or they chose `plan_30`), SunPay's internal **float** covers their share so the
purchase still completes, and that member repays within 30 days.

## Architecture

One repo, two processes:

- `app/` — Next.js 15 (App Router, TypeScript), SunPay itself → `localhost:3000`. UI + API
  routes (`src/app/api/**`) in one process.
- `merchant/` — Express + static HTML/CSS/JS (`merchant/server.js`, `merchant/public/`), a
  self-built "TicketMaster" demo storefront → `localhost:3001`. Deliberately **not** Next.js.
  Keep a "demo — not affiliated" footer line. Its order store is in-memory, (re)seeded on boot.

Flow: the merchant page loads SunPay's `app/public/sdk.js` script tag, hands off at checkout via
an **HMAC-signed URL** to `/split/new`, SunPay charges the group, then fires a **signed
server-to-server callback** to `POST /api/payment-callback` on the merchant, which flips the
order Pending → Confirmed. Settlement mode is `direct` only (SunPay pays the merchant, simulated
via a paid flag + ledger entry).

**Where the important logic lives:**
- `src/lib/engine.ts` — `executeSplit()`: the whole charge loop, §5 ledger postings, merchant
  settlement, the signed callback, and repayment. Routes and the verify scripts both call it.
- `src/lib/ledger.ts` — `postTransaction()` (throws on unbalanced) and `balances()`.
- `src/lib/allocate.ts` — splitting a total into per-member integer-cent shares (odd-cent rule).
- `src/lib/db.ts` — the verbatim §4 schema string + the `better-sqlite3` singleton.
- `src/lib/sign.ts` — HMAC sign/verify, mirrored byte-for-byte in `merchant/server.js`.
- `src/lib/auth.ts` — `currentUser()`, resolving an Auth0 session to a `users` row (email
  auto-link for seeded placeholder rows). `src/middleware.ts` gates protected routes.
- `src/app/api/stays/route.ts` — server-only Stay22 proxy with the 60-min cache + fixture fallback.

## The double-entry ledger (central concept)

**All balances are derived by summing `ledger_entries` — never stored.** Every money movement is
a balanced set of debit/credit entries posted through a single `postTransaction` helper that
**throws if the entry set is unbalanced**. Accounts: `cash`, `member_funds_held:{userId}`,
`member_receivable:{userId}`, `float_payable`, `merchant_payable:{splitId}`. The posting recipes
for charge-succeeds, decline/plan_30 (float path), merchant settlement, and repayment are given
in the spec's §5 — follow them exactly.

**Money is integer cents everywhere.** Every amount column is `INTEGER`. No floats, ever.

## Fixed tech stack

- DB: SQLite file `app/dev.db` via `better-sqlite3`, **raw SQL, no ORM**. Synchronous; use
  `db.transaction()` for atomicity.
- Payments: Stripe **test mode only** — `SetupIntent` saves cards; `PaymentIntent` with
  `off_session: true, confirm: true` for synchronous results. No webhooks, no Stripe CLI.
- Auth: `@auth0/nextjs-auth0` — run `npm ls @auth0/nextjs-auth0` first and follow the installed
  major version's docs. Includes step-up MFA on payments over `STEP_UP_THRESHOLD_CENTS`.
- Hotels: Stay22 Accommodations Search API, proxied **server-side only** (the key never reaches
  the browser), 60-min in-memory cache, with `fixtures/stay22.json` as offline fallback. Never
  persist listings to the DB.
- UI: Tailwind + shadcn/ui.

## Commands

Root `package.json` proxies into `app/`: `npm run seed`, `npm run dev:app`, `npm run dev:merchant`,
`npm test`. Or run inside each subdir:

- `cd app && npm run seed` — deletes `dev.db`, recreates the §4 schema, seeds demo data (group
  "Cancun Trip", order `ORD-8814`), and creates fresh Stripe **test** customers. **This is the DB
  reset.** A running `:3000` dev server keeps a handle to the old file, so **restart it after seeding.**
- `cd app && npm run dev` — SunPay on :3000 (Next + Turbopack). `npm run build` for a prod build.
- `cd merchant && npm run dev` — TicketMaster on :3001; reseeds order `ORD-8814` ($700) on boot.
- `cd app && npm run lint` — ESLint.

Tests & verification (all in `app/`, most need `.env.local` for live Stripe/Stay22 calls):

- `npm test` — `allocate` + `ledger` unit tests (`tsx --test src/lib/*.test.ts`). To run one file:
  `npx tsx --test src/lib/allocate.test.ts`.
- `npx tsx --env-file=.env.local scripts/verify-engine.ts` — full engine run against seeded data
  (run **after** `npm run seed`); asserts charge/decline/float, double-execute block, books balance.
- `scripts/verify-stays-fallback.ts`, `scripts/proof-stripe.ts`, `scripts/proof-stay22.ts` — Stay22
  fixture fallback, raw Stripe success+decline, and a live Stay22 call (refreshes `fixtures/stay22.json`).

To verify end-to-end, seed + run both dev servers and walk the demo script (spec §10 / README).

## Security invariants (spec §7 — the complete list, do not exceed)

- **No double execution:** the atomic `draft → executing` UPDATE is the only guard; a duplicate
  request sees 0 rows updated.
- **No double charge:** Stripe idempotency key `{splitId}:{obligationId}` on every PaymentIntent.
- **Signed handoffs:** HMAC (`crypto.createHmac`) on both the merchant→SunPay URL and the
  SunPay→merchant callback; reject invalid signatures.
- **Server-side authorization:** execute requires the organizer session; repayment requires the
  obligation owner; group access requires membership; caps validated server-side.
- **Step-up MFA on execute:** server-side `amr: mfa` check, with `AUTH0_SKIP_STEPUP` dev escape hatch.

## Environment

Secrets live in `app/.env.local` (gitignored) and `merchant/.env`, both already populated. `app/`
holds the Auth0 vars, Stripe test keys, `STAY22_API_KEY`, `APP_BASE_URL`, `SDK_SHARED_SECRET`,
`MERCHANT_CALLBACK_URL`, `STEP_UP_THRESHOLD_CENTS=50000`, and `AUTH0_SKIP_STEPUP`. `merchant/.env`
holds the **same** `SDK_SHARED_SECRET` (the HMAC only verifies if both sides match) plus `SUNPAY_URL`.
See the README for the Auth0-tenant and Stripe-test-card setup the demo depends on.

## Working conventions (from `.claude/skills/engineering`)

- Plan non-trivial work in `tasks/todo.md` with checkable items; add a review section when done.
- After **any** user correction, append the pattern to `tasks/lessons.md` so the mistake isn't
  repeated; review it at session start.
- Verify before marking done — prove it works (run the seed, exercise the flow), don't just assert it.
