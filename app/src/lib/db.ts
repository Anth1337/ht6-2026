import Database from "better-sqlite3";
import path from "node:path";

// Schema per spec §4, verbatim (IF NOT EXISTS added so opening is idempotent;
// `npm run seed` deletes the file for a full reset).
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
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

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  organizer_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
  group_id TEXT NOT NULL REFERENCES groups(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  cap_cents INTEGER NOT NULL,
  accepted_at INTEGER,                   -- NULL = invited, not yet accepted
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS splits (
  id TEXT PRIMARY KEY,
  group_id TEXT REFERENCES groups(id),
  merchant_name TEXT NOT NULL,
  external_order_id TEXT UNIQUE NOT NULL,
  total_cents INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'draft',   -- 'draft' | 'executing' | 'settled'
  return_url TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS obligations (
  id TEXT PRIMARY KEY,
  split_id TEXT NOT NULL REFERENCES splits(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  principal_cents INTEGER NOT NULL,
  plan_type TEXT NOT NULL,               -- 'charge_now' | 'plan_30'
  paid_cents INTEGER NOT NULL DEFAULT 0,
  due_date INTEGER,
  state TEXT NOT NULL DEFAULT 'pending'  -- 'pending' | 'charged' | 'floated' | 'settled'
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  obligation_id TEXT NOT NULL REFERENCES obligations(id),
  amount_cents INTEGER NOT NULL,
  stripe_payment_intent_id TEXT,
  status TEXT NOT NULL,                  -- 'succeeded' | 'declined' | 'errored'
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ledger_txns (
  id TEXT PRIMARY KEY,
  split_id TEXT,
  kind TEXT NOT NULL,   -- 'member_charge' | 'float_advance' | 'merchant_settlement' | 'repayment'
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id TEXT PRIMARY KEY,
  txn_id TEXT NOT NULL REFERENCES ledger_txns(id),
  account TEXT NOT NULL,
  direction TEXT NOT NULL,               -- 'debit' | 'credit'
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0)
);
`;

export function openDb(file?: string): Database.Database {
  const db = new Database(file ?? path.join(process.cwd(), "dev.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

// Singleton across Next.js dev hot-reloads.
const g = globalThis as unknown as { __sunpayDb?: Database.Database };
export const db: Database.Database = g.__sunpayDb ?? (g.__sunpayDb = openDb());
