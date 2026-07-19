# SunPay — Implementation Plan (v3, Direct-Only)

> **Instructions for Claude Code:** This document is the complete specification for a hackathon project. Read it fully before writing code. Build in the phase order in §11 — later phases depend on earlier ones. Where this document makes a decision, follow it; do not substitute alternatives (do not swap SQLite for Postgres, do not add an ORM, do not add webhooks, do not add a job queue). Everything runs on localhost; there is no deployment step. **The goal is a working end-to-end demo where every feature functions and every screen is wired to a real backend — not production-grade financial infrastructure.** Keep consistency and security barebones-but-real: no fake data on screens, no hardcoded balances, but also no defensive engineering beyond what §7 specifies.

---

## 1. What SunPay is

SunPay is a **group payment engine**. One person checks out for a group purchase; every member of their group is charged their share automatically from a card saved on file; the merchant is paid in full immediately. If a member's card declines (or they've opted into a payment plan), SunPay's internal **float** covers their share so the purchase still completes, and that member repays SunPay within 30 days.

Pitch: *"Klarna splits your payment across time. SunPay splits it across people — and the merchant gets paid in full either way."*

Three integrations:
- **Stripe test mode** moves all money. No real money ever moves; synthetic data only.
- **Auth0** — login, plus step-up MFA when authorizing a payment over a threshold.
- **Stay22 Accommodations Search API** (`https://dev.stay22.com/docs/api/accommodations/search`) — live hotel inventory lookup powering a read-only, in-app group budget discovery feature.

Single entry point into the engine:
1. **External merchant checkout**: a demo ticket-selling site ("TicketMaster" — a lookalike we build ourselves; it is a demo prop, keep a "demo — not affiliated" line in its footer) has a **Split with SunPay** button that hands off to SunPay. SunPay charges the group and pays the merchant directly via automated server-to-server callback (`direct` settlement).

---

## 2. Architecture

One repo, two processes:
```
/app        Next.js 15 (App Router, TypeScript) — SunPay          → localhost:3000
/merchant   Express + static HTML/CSS/JS — "TicketMaster" demo    → localhost:3001
```

The merchant app embeds SunPay's script-tag SDK, hands off at checkout via a signed URL wrapper, receives a server-to-server callback when the split settles, and flips the order **Pending → Confirmed**.

| Settlement mode | Who pays the merchant | Collection target account | Settlement Trigger |
|---|---|---|---|
| `direct` (TicketMaster) | SunPay directly (simulated — a paid flag + ledger entry) | `merchant_payable:{splitId}` | Automated server-to-server callback verified via HMAC. |

---

## 3. Tech stack (fixed)

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 15, App Router, TypeScript | UI + API routes, one process |
| Database | SQLite file `app/dev.db` | Reset = `rm dev.db && npm run seed` |
| DB access | `better-sqlite3`, raw SQL, no ORM | Synchronous; `db.transaction()` for atomicity |
| Payments | Stripe test mode | `SetupIntent` saves cards; `PaymentIntent` with `off_session: true, confirm: true` → synchronous result. **No webhooks, no Stripe CLI** |
| Auth | `@auth0/nextjs-auth0` | **Run `npm ls @auth0/nextjs-auth0` first and follow the installed major version's docs** |
| Hotels | Stay22 Accommodations Search API | Read-only proxy server-side; 60-min in-memory cache; **save response as `fixtures/stay22.json` for offline fallback.** Never persist listings to DB. |
| Merchant | Express, plain HTML | Deliberately not Next.js |
| UI | Tailwind + shadcn/ui | Clean, no custom design system |
| Money | **Integer cents everywhere** | Every amount column is `INTEGER` cents. No floats, ever |

`.env.local` (app): `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, Auth0 vars, `STAY22_API_KEY`, `SDK_SHARED_SECRET`, `MERCHANT_CALLBACK_URL=http://localhost:3001/api/payment-callback`, `STEP_UP_THRESHOLD_CENTS=50000`, `AUTH0_SKIP_STEPUP` (dev escape hatch).
`.env` (merchant): `SDK_SHARED_SECRET` (same value), `SUNPAY_URL=http://localhost:3000`.

---

## 4. Database schema

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  auth0_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  stripe_customer_id TEXT,
  payment_method_id TEXT,
  card_brand TEXT, card_last4 TEXT,
  default_plan TEXT NOT NULL DEFAULT 'charge_now',  -- 'charge_now' | 'plan_30'
  created_at INTEGER NOT NULL
);

CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  organizer_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE memberships (
  group_id TEXT NOT NULL REFERENCES groups(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  cap_cents INTEGER NOT NULL,
  accepted_at INTEGER,                   -- NULL = invited, not yet accepted
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE splits (
  id TEXT PRIMARY KEY,
  group_id TEXT REFERENCES groups(id),   
  merchant_name TEXT NOT NULL,
  external_order_id TEXT UNIQUE NOT NULL,
  total_cents INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'draft',   -- 'draft' | 'executing' | 'settled'
  return_url TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE obligations (
  id TEXT PRIMARY KEY,
  split_id TEXT NOT NULL REFERENCES splits(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  principal_cents INTEGER NOT NULL,
  plan_type TEXT NOT NULL,               -- 'charge_now' | 'plan_30'
  paid_cents INTEGER NOT NULL DEFAULT 0,
  due_date INTEGER,
  state TEXT NOT NULL DEFAULT 'pending'  -- 'pending' | 'charged' | 'floated' | 'settled'
);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  obligation_id TEXT NOT NULL REFERENCES obligations(id),
  amount_cents INTEGER NOT NULL,
  stripe_payment_intent_id TEXT,
  status TEXT NOT NULL,                  -- 'succeeded' | 'declined' | 'errored'
  created_at INTEGER NOT NULL
);

CREATE TABLE ledger_txns (
  id TEXT PRIMARY KEY,
  split_id TEXT,
  kind TEXT NOT NULL,   -- 'member_charge' | 'float_advance' | 'merchant_settlement' | 'repayment'
  created_at INTEGER NOT NULL
);

CREATE TABLE ledger_entries (
  id TEXT PRIMARY KEY,
  txn_id TEXT NOT NULL REFERENCES ledger_txns(id),
  account TEXT NOT NULL,
  direction TEXT NOT NULL,               -- 'debit' | 'credit'
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0)
);
```

---

## 5. Ledger

Balances are calculated entirely by summing over `ledger_entries`.

**Accounts:** `cash`, `member_funds_held:{userId}`, `member_receivable:{userId}`, `float_payable`, `merchant_payable:{splitId}`.

**Posting Recipe (Direct Mode, per member):**
- Card charge succeeds → debit `cash`, credit `member_funds_held:{uid}`
- Card declines / plan_30 → debit `cash`, credit `float_payable` **and** debit `member_receivable:{uid}`, credit `member_funds_held:{uid}`
- After all members processed: debit all `member_funds_held:*`, credit `merchant_payable:{splitId}` for the total; then debit `merchant_payable:{splitId}`, credit `cash` (merchant settlement).

**Repayment (Floated member pays back later):**
- Debit `cash`, credit `member_receivable:{uid}`
- Debit `float_payable`, credit `cash`

---

## 6. End-to-end user experience

### Journey A — First-time user onboarding
- **A1. Landing `/`**: Click Sign in → Auth0 provisioning → `/dashboard`.
- **A2. Card onboarding `/onboarding/card`**: Forces Stripe Elements setup before using authenticated features.
- **A3. Dashboard `/dashboard`**: View total outstanding debt to SunPay, active groups, and recent obligation states.

### Journey B — Group formation
- **B1. Create group `/groups/new`**: Input group name and uniform member spending caps.
- **B2. Group page `/groups/:id`**: Manage roster and invite link. **Find a stay** button activates only when all invites are accepted.
- **B3. Join screen `/join/:inviteCode`**: Consent screen confirming the user authorizes up to the group cap.

### Journey C — In-app hotel discovery (Pure Budget Research)
- **C1. Find a stay `/groups/:id/stays`**: Perform location search. Backend proxies request to the Stay22 Accommodations Search API. Per-person prices are calculated dynamically. If any single member's calculated split exceeds their saved group `cap_cents`, the hotel card is locked and greyed out with an "Over budget for 1 member" warning. No booking links or logs flow into the payment engine.

### Journey D — External merchant checkout (TicketMaster)
- **D0. TicketMaster Checkout**: User clicks **⚡ Split with SunPay** on `localhost:3001`, passing signed URL parameters to `localhost:3000/split/new`.
- **D1. Split entry `/split/new`**: Verify signature. User picks an eligible group. System creates `draft` split + member obligations via `allocate()`.
- **D2. Review `/split/:id/review`**: Table breakdown of shares. Clicking **Authorize** runs step-up MFA if threshold exceeded, then runs execution loop sequentially executing Stripe off-session calls.
- **D3. Execution screen `/split/:id`**: Live updating poll of member charge statuses. Hits merchant callback webhook on completion. Shows **Return to TicketMaster** button.
- **D4. TicketMaster order page**: Flips state automatically to **Order confirmed ✓ — Paid via SunPay**.

### Journey E — Settlement (Repayment)
- **E1. Debtor Dashboard**: Floated member clicks outstanding obligation → Pay now via alternate stored card token, zeroing out their balance.

---

## 7. Barebones consistency & security (the complete list — do not exceed it)

1. **No double execution:** the atomic `draft → executing` UPDATE is the only guard. A duplicate click/request sees 0 rows updated and receives the in-progress or settled state.
2. **No double Stripe charge:** Stripe idempotency key `{splitId}:{obligationId}` on every PaymentIntent.
3. **Signed handoffs:** HMAC on merchant → SunPay URL and on the SunPay → merchant callback (~10 lines of `crypto.createHmac` each side). Reject invalid signatures.
4. **Server-side authorization:** execute requires organizer session; repayment requires obligation owner; groups require membership; caps validated server-side.
5. **Balanced-ledger throw:** `postTransaction` refuses unbalanced entry sets.
6. **Step-up MFA check on execute** (server-side `amr` check) with the `AUTH0_SKIP_STEPUP` escape hatch.
7. Secrets in `.env.local` (gitignored); the Stay22 key never reaches the browser.

---

## 8. Seed script (`npm run seed` — write in Phase 1)

Deletes `dev.db`, recreates the schema, then:
- 3 users mapped to real Auth0 ids from `seed/auth0-users.json`:
  - **Alice** (organizer) — working card (`pm_card_visa`)
  - **Bob** — working card
  - **Carol** — declining card (`pm_card_visa_chargeDeclined`, or attach `4000000000000002`) **plus a second, working method** for the repayment beat; `default_plan = 'charge_now'`
- Group "Cancun Trip", invite code fixed to `CANCUN1`, all memberships accepted; caps Alice $1,500 / Bob $1,200 / Carol $500
- Stay22 search fixture present at `fixtures/stay22.json` (stubbed response mimicking the structure of `https://dev.stay22.com/docs/api/accommodations/search`)
- Merchant app seeds order `ORD-8814` ($700.00) on boot

---

## 9. API routes (complete list)

```
GET  /sdk.js                          public; the merchant embed script
POST /api/setup-intent                create SetupIntent
POST /api/setup-intent/complete       store payment method
GET  /api/me/summary                  balances + groups + recent obligations
POST /api/groups                      create
GET  /api/groups/:id                  roster + status
POST /api/groups/join                 accept invite (writes accepted_at)
GET  /api/stays                       Stay22 proxy hitting /accommodations/search + cap filter + fixture fallback
POST /api/splits                      create draft + obligations (sig verified for SDK entries)
GET  /api/splits/:id                  state + per-obligation status (polled by D3)
POST /api/splits/:id/execute          the engine (§6-D2, §7)
POST /api/obligations/:id/pay         repayment
GET  /api/ledger                      txns + entries + balances + balanced flag
```

Merchant app: `GET /event`, `GET /checkout/:orderId`, `GET /order/:orderId`, `GET /api/order/:id`, `POST /api/payment-callback` (verifies HMAC, flips the order).

---

## 10. Demo script (3 minutes — rehearse against this exactly)

1. **TicketMaster** `/event` — 3 tickets, $700 → Checkout → **⚡ Split with SunPay**
2. Lands on SunPay → pick "Cancun Trip" → review shows 3 shares, Alice's odd cent flagged
3. **Authorize** → Auth0 step-up MFA (Alice types her TOTP code) — say out loud: "MFA on the payment, not the login"
4. Execution screen: Alice ✓, Bob ✓, **Carol declines → float covers $233.33** — merchant still paid in full
5. **Return to TicketMaster** → order flips **Confirmed ✓ — Paid via SunPay**
6. Carol's dashboard: owes $233.33 → Pay now (second card) → **All settled ✓**
7. `/ledger` — every movement listed, **BOOKS BALANCED ✓**
8. If time: `/groups/:id/stays` — Cancun search, per-person prices derived from the Accommodations Search payload, one listing greyed "Over budget for 1 member" due to cap enforcement

---

## 11. Build phases

- **Phase 0 — Integration proofs:** Auth0 login round-trip, single manual Stripe off-session charge script, server-to-server call to Stay22 search endpoint saving payload to `fixtures/stay22.json`.
- **Phase 1 — Data + ledger:** Schema layout, transaction atomic wrapper, allocation testing, and `/ledger` diagnostic page.
- **Phase 2 — Onboarding + groups:** Complete user enrollment pipeline and authorization join limits.
- **Phase 3 — Split engine:** Stripe off-session sequencing, fallback float paths, transaction ledger evaluation, execution polling.
- **Phase 4 — Merchant + SDK:** Dummy ticket site construction, script asset injection, signature verification and callback parsing loops.
- **Phase 5 — Stay22 Lookup + step-up MFA:** Build proxy filter parsing cap parameters, enforce Auth0 MFA verification checks.
- **Phase 6 — Polish + docs:** Generate comprehensive diagnostics run configurations.

---

## 12. README must include

> **Sandbox statement:** This project uses Stripe test mode and synthetic data exclusively. No real money moves, no live banking or card credentials are collected, and no personal financial information is exposed. The "TicketMaster" storefront is a demo prop built by us for illustration and is not affiliated with the real merchant.

Plus: setup, `npm run seed`, both dev commands, manual Auth0 steps (§8), Stripe test cards, and the demo script (§10).

---

## 13. Definition of done

- [ ] `npm run seed` + both dev servers → the full §10 demo runs with zero manual DB edits
- [ ] Every number on every screen is computed from the DB/ledger (grep for hardcoded amounts: none)
- [ ] Double-clicking Authorize produces exactly one charge set (verify in the Stripe test dashboard)
- [ ] Tampering with `amount` in the handoff URL → rejected (bad signature)
- [ ] Carol's decline → float covers → merchant/organizer still fully settled → her repayment zeroes her balance
- [ ] `allocate(70000, 3)` test passes; the ledger badge shows balanced after every journey
- [ ] Stay22 interface maps and renders listings from the `accommodations/search` format with the network unplugged (fixture fallback)
- [ ] Above-threshold execute blocked server-side without `amr: mfa` (unless `AUTH0_SKIP_STEPUP=true`)
- [ ] TicketMaster order flips Pending → Confirmed via the callback
