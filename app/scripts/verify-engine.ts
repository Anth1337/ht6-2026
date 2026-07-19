/**
 * Phase 3 verification (spec §13): run the engine against seeded data.
 * Asserts: charged/charged/floated, ledger balanced, double-execute is a
 * no-op with exactly one PaymentIntent per obligation, repayment zeroes
 * the floated member's balance.
 * Run AFTER `npm run seed`: npx tsx --env-file=.env.local scripts/verify-engine.ts
 */
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { newId } from "../src/lib/id";
import { allocate } from "../src/lib/allocate";
import { executeSplit, repayObligation } from "../src/lib/engine";
import { accountBalance, isBalanced } from "../src/lib/ledger";
import { stripe } from "../src/lib/stripe";

async function main() {
  const group = db
    .prepare("SELECT * FROM groups WHERE invite_code = 'CANCUN1'")
    .get() as { id: string; organizer_id: string } | undefined;
  assert.ok(group, "seeded group missing — run `npm run seed` first");

  const members = db
    .prepare(
      `SELECT m.user_id, u.name FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.group_id = ? ORDER BY (m.user_id = ?) DESC, m.accepted_at, m.rowid`
    )
    .all(group.id, group.organizer_id) as { user_id: string; name: string }[];
  assert.equal(members.length, 3);

  // Create the $700 draft split exactly as POST /api/splits would.
  const splitId = newId("spl");
  const orderId = `VERIFY-${Date.now()}`;
  const shares = allocate(70000, 3);
  assert.deepEqual(shares, [23334, 23333, 23333]);
  db.transaction(() => {
    db.prepare(
      `INSERT INTO splits (id, group_id, merchant_name, external_order_id, total_cents, state, created_at)
       VALUES (?, ?, 'VerifyMart', ?, 70000, 'draft', ?)`
    ).run(splitId, group.id, orderId, Date.now());
    members.forEach((m, i) => {
      db.prepare(
        `INSERT INTO obligations (id, split_id, user_id, principal_cents, plan_type, state)
         VALUES (?, ?, ?, ?, 'charge_now', 'pending')`
      ).run(newId("obl"), splitId, m.user_id, shares[i]);
    });
  })();

  // Execute — and race a second execute to prove the §7.1 guard.
  const [first, second] = await Promise.all([
    executeSplit(splitId),
    executeSplit(splitId),
  ]);
  const ranTwice = !first.already_running && !second.already_running;
  assert.ok(!ranTwice, "double execution not blocked!");
  // let the winner finish (Promise.all already awaited both)

  const obligations = db
    .prepare("SELECT * FROM obligations WHERE split_id = ? ORDER BY rowid")
    .all(splitId) as { id: string; user_id: string; state: string; principal_cents: number }[];
  console.log(
    obligations
      .map((o, i) => `${members[i].name}: ${o.state} (${o.principal_cents}¢)`)
      .join(" · ")
  );
  assert.deepEqual(
    obligations.map((o) => o.state),
    ["charged", "charged", "floated"],
    "expected organizer+member2 charged, member3 floated"
  );

  // Exactly one PaymentIntent per obligation (idempotency proof).
  // (list by customer — Stripe's search API is eventually consistent)
  for (const o of obligations) {
    const customer = (
      db.prepare("SELECT stripe_customer_id FROM users WHERE id = ?").get(o.user_id) as {
        stripe_customer_id: string;
      }
    ).stripe_customer_id;
    const pis = await stripe.paymentIntents.list({ customer, limit: 100 });
    const forObligation = pis.data.filter(
      (pi) => pi.metadata.obligation_id === o.id
    );
    assert.equal(
      forObligation.length,
      1,
      `expected 1 PaymentIntent for ${o.id}, got ${forObligation.length}`
    );
  }

  // Ledger invariants after settlement.
  assert.ok(isBalanced(), "books unbalanced after settlement");
  const floated = obligations[2];
  assert.equal(accountBalance(`member_receivable:${floated.user_id}`), 23333);
  assert.equal(accountBalance("float_payable"), -23333);
  assert.equal(accountBalance(`merchant_payable:${splitId}`), 0);
  const splitState = (
    db.prepare("SELECT state FROM splits WHERE id = ?").get(splitId) as { state: string }
  ).state;
  assert.equal(splitState, "settled");
  console.log("execute ✓  (charged, charged, floated; books balanced; 1 PI each)");

  // Repayment zeroes the floated member's balance and unwinds the float.
  const repaid = await repayObligation(floated.id);
  assert.equal(repaid.paid_cents, 23333);
  assert.equal(accountBalance(`member_receivable:${floated.user_id}`), 0);
  assert.equal(accountBalance("float_payable"), 0);
  assert.ok(isBalanced(), "books unbalanced after repayment");
  const oblState = (
    db.prepare("SELECT state FROM obligations WHERE id = ?").get(floated.id) as { state: string }
  ).state;
  assert.equal(oblState, "settled");
  console.log("repayment ✓ (receivable zeroed, float unwound, books balanced)");

  console.log("ENGINE VERIFIED ✓");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
