import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { balances, isBalanced } from "@/lib/ledger";

export const dynamic = "force-dynamic";

export async function GET() {
  const txns = db
    .prepare("SELECT * FROM ledger_txns ORDER BY created_at DESC, id")
    .all() as Record<string, unknown>[];
  const entries = db
    .prepare(
      `SELECT e.* FROM ledger_entries e
       JOIN ledger_txns t ON t.id = e.txn_id
       ORDER BY t.created_at DESC, e.id`
    )
    .all() as { txn_id: string }[];
  const byTxn = new Map<string, unknown[]>();
  for (const e of entries) {
    if (!byTxn.has(e.txn_id)) byTxn.set(e.txn_id, []);
    byTxn.get(e.txn_id)!.push(e);
  }
  return NextResponse.json({
    txns: txns.map((t) => ({ ...t, entries: byTxn.get(t.id as string) ?? [] })),
    balances: balances(),
    balanced: isBalanced(),
  });
}
