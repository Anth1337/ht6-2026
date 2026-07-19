# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

This repo is **pre-implementation**. The only substantive artifact is the spec
`sunpay_implementation_plan_v3 (1).md` — the complete, authoritative specification for a
hackathon project called **SunPay**. There is no `app/` or `merchant/` code yet, no
`package.json`, and no database. Read the plan in full before writing any code; build in the
Phase order in its §11 (later phases depend on earlier ones).

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

## Architecture (once built)

One repo, two processes:

- `app/` — Next.js 15 (App Router, TypeScript), SunPay itself → `localhost:3000`. UI + API
  routes in one process.
- `merchant/` — Express + static HTML/CSS/JS, a self-built "TicketMaster" demo storefront →
  `localhost:3001`. Deliberately **not** Next.js. Keep a "demo — not affiliated" footer line.

Flow: the merchant embeds SunPay's `/sdk.js` script tag, hands off at checkout via an
**HMAC-signed URL** to `/split/new`, SunPay charges the group, then fires a **signed
server-to-server callback** to `POST /api/payment-callback` on the merchant, which flips the
order Pending → Confirmed. Settlement mode is `direct` only (SunPay pays the merchant, simulated
via a paid flag + ledger entry).

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

## Commands (to be created during Phase 1)

These do not exist yet; wire them into `app/package.json` as you build:

- `npm run seed` — deletes `dev.db`, recreates the schema, and seeds demo data (users Alice/Bob/
  Carol, group "Cancun Trip" invite `CANCUN1`, etc.). **DB reset = `rm app/dev.db && npm run seed`.**
- `npm run dev` (in `app/`) — SunPay on :3000.
- Merchant dev command (in `merchant/`) — TicketMaster on :3001, seeds order `ORD-8814` ($700) on boot.

Run the seed + both dev servers and walk the demo script (spec §10) to verify end-to-end.

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

Secrets live in `.env.local` (gitignored). Already present: Auth0 vars, Stripe keys,
`STAY22_API_KEY`, `APP_BASE_URL`. Still to add per spec §3: `SDK_SHARED_SECRET` (same value shared
with the merchant's `.env`), `MERCHANT_CALLBACK_URL`, `STEP_UP_THRESHOLD_CENTS=50000`,
`AUTH0_SKIP_STEPUP`, and (merchant side) `SUNPAY_URL`.

## Working conventions (from `.claude/skills/engineering`)

- Plan non-trivial work in `tasks/todo.md` with checkable items; add a review section when done.
- After **any** user correction, append the pattern to `tasks/lessons.md` so the mistake isn't
  repeated; review it at session start.
- Verify before marking done — prove it works (run the seed, exercise the flow), don't just assert it.
