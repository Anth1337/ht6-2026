# Lessons

- **Stripe decline test cards**: `pm_card_visa_chargeDeclined` declines at *attach* time, so it can't model a saved-card-that-later-declines. Use `pm_card_chargeCustomerFail` (card `4000000000000341`) — attach/setup succeeds, off-session charges decline. (Found in Phase 0 proof, 2026-07-18.)
- **@auth0/nextjs-auth0 v4.25 peer deps**: requires react ≥19.1.2; create-next-app@15 pins 19.1.0 — bump react/react-dom to `~19.1.2` before installing.
- **Reseeding needs an app-server restart**: `npm run seed` unlinks & recreates `app/dev.db`, but a running Next dev server keeps a file handle to the OLD (now-unlinked) inode on macOS, so it silently reads stale data. After any `npm run seed`, restart `:3000`. The in-app "Reset demo" button avoids this (same process creates + purges the split). (2026-07-18)
