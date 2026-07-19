# SunPay build — todo

Plan: `/Users/anth/.claude/plans/please-implement-the-sunpay-implementati-scalable-dusk.md` (approved 2026-07-18)

- [x] Phase 0 — Integration proofs: scaffold, Auth0 redirect proof, Stripe charge/decline proof, Stay22 fixture captured
- [x] Phase 1 — Data + ledger: schema, postTransaction, allocate (+6 passing tests), seed, /ledger page
- [x] Phase 2 — Onboarding + groups (code complete; interactive login pass pending below)
- [x] Phase 3 — Split engine: ENGINE VERIFIED ✓ (charged/charged/floated, double-execute blocked, 1 PI per obligation, books balanced, repayment unwinds float)
- [x] Phase 4 — Merchant + SDK: handoff sig validates cross-side, tampered sig/amount → 403, callback flips order
- [x] Phase 5 — Stay22 (+offline fixture fallback verified) + step-up MFA wiring (acr_values forwarding verified)
- [x] Phase 6 — README, root scripts, production build passes, hardcoded-amount grep clean

## Klarna-style app shell revamp (approved 2026-07-19)

Plan: `/Users/anth/.claude/plans/continue-to-make-a-gleaming-matsumoto.md`

- [x] Phase 1 — Tokens: `--radius` 0→1rem, `--card` #141414, remove film grain
- [x] Phase 2 — Shell: `app-shell.tsx` + `sidebar.tsx`, migrate all 10 pages, delete `nav.tsx`
- [x] Phase 3 — Dashboard widgets: hero balance card, flat rows, header action; Card ring removed
- [x] Verify: screenshots (1440/900/480 on /history; hotel-demo + merchant regression), lint, tsc

Review notes:
- Fixed a pre-existing font bug found during verification: `@theme` mapped
  `--font-sans` to itself and `font-sans` sat on `<html>` while layout.tsx defines
  the Geist vars on `<body>` — the whole app was silently rendering in serif.
  Now `--font-sans: var(--font-geist-sans)` and `body` carries `font-sans`.
- `npm run build` not run (dev server on :3000 holds `.next`); lint + `tsc --noEmit`
  are clean and /history renders. Run a build after stopping the dev server.
- /dashboard is auth-gated so headless screenshots used /history (same shell);
  dashboard widgets need a quick eyeball during the §10 browser pass.

## Remaining (needs the user)

- [ ] Fill `app/seed/auth0-users.json` with the 3 real Auth0 users (or rely on email auto-link), reseed
- [ ] Browser pass of the full §10 demo (login, card views, handoff, execute, repay, stays)
- [ ] For the MFA beat: enable TOTP in the Auth0 tenant, enroll organizer, set `AUTH0_SKIP_STEPUP=false`

## Review

All engine-level §13 items verified by script (`scripts/verify-engine.ts`, `scripts/verify-stays-fallback.ts`).
Key deviations from spec, all deliberate:
- Decline card is `pm_card_chargeCustomerFail` (4000…0341) because `pm_card_visa_chargeDeclined` declines at attach (spec anticipated with "or attach 4000000000000002", which also declines at setup).
- Seed users are the user's real 3 Auth0 accounts (roles organizer/member2/member3), not literal Alice/Bob/Carol; email auto-link fallback added.
- Engine core extracted to `src/lib/engine.ts` so routes and verification scripts share one implementation.
