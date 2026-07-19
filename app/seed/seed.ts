/**
 * npm run seed — full reset per spec §8.
 * Deletes dev.db, recreates the schema, creates Stripe test customers with
 * saved cards, and seeds the "Cancun Trip" group with all invites accepted.
 * Run: npx tsx --env-file=.env.local seed/seed.ts
 */
import { existsSync, rmSync, readFileSync } from "node:fs";
import path from "node:path";
import Stripe from "stripe";
import { openDb } from "../src/lib/db";
import { newId } from "../src/lib/id";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

interface SeedUser {
  role: string;
  auth0_id: string;
  email: string;
  name: string;
}

async function main() {
  const dbPath = path.join(process.cwd(), "dev.db");
  for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (existsSync(f)) rmSync(f);
  }
  const db = openDb(dbPath);
  console.log("dev.db recreated");

  const { users: seedUsers } = JSON.parse(
    readFileSync(path.join(process.cwd(), "seed", "auth0-users.json"), "utf8")
  ) as { users: SeedUser[] };
  if (seedUsers.length !== 3) throw new Error("seed: expected exactly 3 users");

  // Cards: organizer + member2 work; member3's default card declines on
  // charge (pm_card_chargeCustomerFail attaches fine, declines off-session)
  // and gets a second working card for the repayment beat.
  const cardPlans: string[][] = [
    ["pm_card_visa"],
    ["pm_card_visa"],
    ["pm_card_chargeCustomerFail", "pm_card_visa"],
  ];

  const insertUser = db.prepare(
    `INSERT INTO users (id, auth0_id, email, name, stripe_customer_id, payment_method_id,
                        card_brand, card_last4, default_plan, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'charge_now', ?)`
  );

  const userIds: string[] = [];
  for (let i = 0; i < 3; i++) {
    const su = seedUsers[i];
    const customer = await stripe.customers.create({
      email: su.email,
      name: su.name,
      metadata: { sunpay_role: su.role },
    });
    let defaultPm: Stripe.PaymentMethod | null = null;
    for (const token of cardPlans[i]) {
      const pm = await stripe.paymentMethods.attach(token, {
        customer: customer.id,
      });
      defaultPm ??= pm; // first card is the default
    }
    const id = newId("usr");
    userIds.push(id);
    insertUser.run(
      id,
      su.auth0_id,
      su.email,
      su.name,
      customer.id,
      defaultPm!.id,
      defaultPm!.card?.brand ?? null,
      defaultPm!.card?.last4 ?? null,
      Date.now()
    );
    console.log(
      `user ${su.name} (${su.role}) → ${customer.id}, card ${defaultPm!.card?.brand} •••• ${defaultPm!.card?.last4}${cardPlans[i].length > 1 ? " (+backup card)" : ""}`
    );
  }

  // Group "Cancun Trip", invite CANCUN1, all accepted; caps $1,500/$1,200/$500.
  const groupId = newId("grp");
  db.prepare(
    "INSERT INTO groups (id, organizer_id, name, invite_code, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(groupId, userIds[0], "Cancun Trip", "CANCUN1", Date.now());
  const caps = [150000, 120000, 50000];
  const insertMembership = db.prepare(
    "INSERT INTO memberships (group_id, user_id, cap_cents, accepted_at) VALUES (?, ?, ?, ?)"
  );
  userIds.forEach((uid, i) => insertMembership.run(groupId, uid, caps[i], Date.now()));
  console.log(`group "Cancun Trip" (${groupId}) invite CANCUN1, 3 members accepted`);

  // Stay22 fixture presence check (captured in Phase 0).
  const fixture = path.join(process.cwd(), "fixtures", "stay22.json");
  console.log(
    existsSync(fixture)
      ? "fixtures/stay22.json present ✓"
      : "WARNING: fixtures/stay22.json missing — run scripts/proof-stay22.ts"
  );

  db.close();
  console.log("Seed complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
