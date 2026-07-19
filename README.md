# SunPay

> **Sandbox statement:** This project uses Stripe test mode and synthetic data exclusively. No real money moves, no live banking or card credentials are collected, and no personal financial information is exposed. The "TicketMaster" storefront is a demo prop built by us for illustration and is not affiliated with the real merchant.

SunPay is a **group payment engine**: one person checks out for a group purchase, every member is charged their share automatically from a saved card, and the merchant is paid in full immediately. If a member's card declines (or they opted into a payment plan), SunPay's internal **float** covers their share and they repay within 30 days.

*Klarna splits your payment across time. SunPay splits it across people — and the merchant gets paid in full either way.*

## Layout

```
app/        Next.js 15 — SunPay          → http://localhost:3000
merchant/   Express — TicketMaster demo  → http://localhost:3001
```

## Setup

1. **Env**: `app/.env.local` needs Auth0 (`AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_SECRET`, `APP_BASE_URL`), Stripe test keys, `STAY22_API_KEY`, `SDK_SHARED_SECRET`, `MERCHANT_CALLBACK_URL=http://localhost:3001/api/payment-callback`, `STEP_UP_THRESHOLD_CENTS=50000`, `AUTH0_SKIP_STEPUP`. `merchant/.env` needs the same `SDK_SHARED_SECRET` plus `SUNPAY_URL=http://localhost:3000`.
2. **Auth0 tenant** (manual):
   - Allowed Callback URLs: `http://localhost:3000/auth/callback`; Allowed Logout URLs: `http://localhost:3000`.
   - Create three users (organizer / member 2 / member 3-declining) and paste each `user_id`, email, and name into `app/seed/auth0-users.json`. If you leave the placeholder ids, login auto-links seeded rows by email.
   - For the step-up MFA beat: enable **TOTP (One-time Password)** MFA in the tenant, enroll the organizer in an authenticator app, and set `AUTH0_SKIP_STEPUP=false`.
3. **Install & seed**:
   ```sh
   cd app && npm install && npm run seed
   cd ../merchant && npm install
   ```
4. **Run** (two terminals):
   ```sh
   cd app && npm run dev        # SunPay  → :3000
   cd merchant && npm run dev   # Merchant → :3001
   ```

DB reset at any time: `cd app && npm run seed` (deletes and rebuilds `dev.db`, creates fresh Stripe test customers).

## Stripe test cards

| Who | Card | Behavior |
|---|---|---|
| Organizer, member 2 | `pm_card_visa` (4242…4242) | charges succeed |
| Member 3 (default) | `pm_card_chargeCustomerFail` (4000 0000 0000 0341) | attaches fine, off-session charges decline |
| Member 3 (backup) | `pm_card_visa` | used for the repayment beat |

New users onboarding by hand can enter `4242 4242 4242 4242`, any future expiry, any CVC.

## Tests & verification scripts (in `app/`)

```sh
npm test                                                    # allocate + ledger unit tests
npx tsx --env-file=.env.local scripts/verify-engine.ts      # full engine run against seeded data (run after seed)
npx tsx --env-file=.env.local scripts/verify-stays-fallback.ts  # Stay22 offline fixture fallback
npx tsx --env-file=.env.local scripts/proof-stripe.ts       # raw Stripe success+decline proof
npx tsx --env-file=.env.local scripts/proof-stay22.ts       # live Stay22 call, refreshes fixtures/stay22.json
```

## Demo script (3 minutes)

1. **TicketMaster** `http://localhost:3001/event` — 3 tickets, $700 → Checkout → **⚡ Split with SunPay**
2. Lands on SunPay (sign in as the organizer) → pick "Cancun Trip" → review shows 3 shares, the organizer's odd cent flagged
3. **Authorize** → Auth0 step-up MFA (organizer types their TOTP code) — *"MFA on the payment, not the login"*
4. Execution screen: member 1 ✓, member 2 ✓, **member 3 declines → float covers $233.33** — merchant still paid in full
5. **Return to TicketMaster** → order flips **Confirmed ✓ — Paid via SunPay**
6. Member 3's dashboard: owes $233.33 → **Pay now** (backup card) → **All settled ✓**
7. `/ledger` — every movement listed, **BOOKS BALANCED ✓**
8. If time: group page → **Find a stay** — Cancun search, per-person prices from the Stay22 Accommodations Search API, over-cap listings greyed "Over budget for 1 member"; in-budget cards have a **Book on {provider} →** link that opens the live provider listing in a new tab (budget research only — never touches the payment engine)

**Re-running the demo:** after the order is confirmed, the TicketMaster order page shows **↺ Reset demo & run again** — one click restores order `ORD-8814` to pending and purges the split + its ledger entries so you can run the identical flow again. There's also a small "Reset demo" link on `/event` for when you abandon a run mid-flow. (Manual reset: `npm run seed` in `app/`, but then restart the `:3000` server — a running dev server keeps a handle to the old DB file.)
