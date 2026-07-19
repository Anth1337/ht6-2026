/**
 * Verify the demo is repeatable: settle ORD-8814 through the engine (which
 * flips the merchant order via callback), then hit the merchant reset and
 * assert BOTH sides return to a clean, re-runnable state.
 * Run after `npm run seed`, with both servers up:
 *   npx tsx --env-file=.env.local scripts/verify-reset.ts
 */
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { newId } from "../src/lib/id";
import { allocate } from "../src/lib/allocate";
import { executeSplit } from "../src/lib/engine";

const MERCHANT = "http://localhost:3001";
const ORDER = "ORD-8814";

async function orderStatus() {
  return (await fetch(`${MERCHANT}/api/order/${ORDER}`).then((r) => r.json())).status;
}
function splitRow() {
  return db.prepare("SELECT * FROM splits WHERE external_order_id = ?").get(ORDER) as
    | { id: string }
    | undefined;
}

async function run() {
  const group = db
    .prepare("SELECT * FROM groups WHERE invite_code = 'CANCUN1'")
    .get() as { id: string; organizer_id: string };
  const members = db
    .prepare(
      `SELECT m.user_id FROM memberships m
       WHERE m.group_id = ? AND m.accepted_at IS NOT NULL
       ORDER BY (m.user_id = ?) DESC, m.rowid`
    )
    .all(group.id, group.organizer_id) as { user_id: string }[];

  const splitId = newId("spl");
  const shares = allocate(70000, members.length);
  db.transaction(() => {
    db.prepare(
      `INSERT INTO splits (id, group_id, merchant_name, external_order_id, total_cents, state, return_url, created_at)
       VALUES (?, ?, 'TicketMaster', ?, 70000, 'draft', ?, ?)`
    ).run(splitId, group.id, ORDER, `${MERCHANT}/order/${ORDER}`, Date.now());
    members.forEach((m, i) =>
      db.prepare(
        `INSERT INTO obligations (id, split_id, user_id, principal_cents, plan_type, state)
         VALUES (?, ?, ?, ?, 'charge_now', 'pending')`
      ).run(newId("obl"), splitId, m.user_id, shares[i])
    );
  })();

  await executeSplit(splitId);
  await new Promise((r) => setTimeout(r, 400)); // let the callback land
  assert.ok(splitRow(), "split should exist after execute");
  assert.equal(await orderStatus(), "confirmed", "merchant order should be confirmed");
  console.log("settled ✓  split exists, merchant order confirmed");
}

async function reset() {
  const res = await fetch(`${MERCHANT}/api/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order_id: ORDER }),
  });
  const json = await res.json();
  assert.ok(json.ok, "reset should succeed");
  assert.equal(json.sunpay_cleared, true, "SunPay purge should succeed");
  await new Promise((r) => setTimeout(r, 200));

  assert.equal(splitRow(), undefined, "split should be purged");
  const orphanTxns = db
    .prepare("SELECT COUNT(*) c FROM ledger_txns WHERE split_id NOT IN (SELECT id FROM splits)")
    .get() as { c: number };
  assert.equal(orphanTxns.c, 0, "no orphan ledger txns");
  assert.equal(await orderStatus(), "pending", "merchant order back to pending");
  console.log("reset ✓  split purged, ledger clean, order pending — re-runnable");
}

run()
  .then(reset)
  .then(() => console.log("REPEATABLE DEMO VERIFIED ✓"))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
