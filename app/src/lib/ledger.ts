import type { Database } from "better-sqlite3";
import { db as defaultDb } from "./db";
import { newId } from "./id";

export type LedgerKind =
  | "member_charge"
  | "float_advance"
  | "merchant_settlement"
  | "repayment";

export interface Entry {
  account: string;
  direction: "debit" | "credit";
  amountCents: number;
}

/**
 * Post a balanced set of ledger entries atomically.
 * Throws if debits !== credits or any amount is not a positive integer (§7.5).
 */
export function postTransaction(
  kind: LedgerKind,
  splitId: string | null,
  entries: Entry[],
  db: Database = defaultDb
): string {
  if (entries.length === 0) throw new Error("ledger: empty entry set");
  let debits = 0;
  let credits = 0;
  for (const e of entries) {
    if (!Number.isInteger(e.amountCents) || e.amountCents <= 0) {
      throw new Error(`ledger: bad amount ${e.amountCents} for ${e.account}`);
    }
    if (e.direction === "debit") debits += e.amountCents;
    else if (e.direction === "credit") credits += e.amountCents;
    else throw new Error(`ledger: bad direction ${e.direction}`);
  }
  if (debits !== credits) {
    throw new Error(`ledger: unbalanced txn (debits ${debits} != credits ${credits})`);
  }

  const txnId = newId("txn");
  const insertTxn = db.prepare(
    "INSERT INTO ledger_txns (id, split_id, kind, created_at) VALUES (?, ?, ?, ?)"
  );
  const insertEntry = db.prepare(
    "INSERT INTO ledger_entries (id, txn_id, account, direction, amount_cents) VALUES (?, ?, ?, ?, ?)"
  );
  db.transaction(() => {
    insertTxn.run(txnId, splitId, kind, Date.now());
    for (const e of entries) {
      insertEntry.run(newId("ent"), txnId, e.account, e.direction, e.amountCents);
    }
  })();
  return txnId;
}

/** Per-account balance as debits − credits (assets positive, liabilities negative). */
export function balances(db: Database = defaultDb): Record<string, number> {
  const rows = db
    .prepare(
      `SELECT account,
              SUM(CASE direction WHEN 'debit' THEN amount_cents ELSE -amount_cents END) AS bal
       FROM ledger_entries GROUP BY account ORDER BY account`
    )
    .all() as { account: string; bal: number }[];
  return Object.fromEntries(rows.map((r) => [r.account, r.bal]));
}

/** Balance (debits − credits) for a single account. */
export function accountBalance(account: string, db: Database = defaultDb): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(CASE direction WHEN 'debit' THEN amount_cents ELSE -amount_cents END), 0) AS bal
       FROM ledger_entries WHERE account = ?`
    )
    .get(account) as { bal: number };
  return row.bal;
}

/** Global invariant: total debits === total credits. */
export function isBalanced(db: Database = defaultDb): boolean {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(CASE direction WHEN 'debit' THEN amount_cents ELSE -amount_cents END), 0) AS diff
       FROM ledger_entries`
    )
    .get() as { diff: number };
  return row.diff === 0;
}
