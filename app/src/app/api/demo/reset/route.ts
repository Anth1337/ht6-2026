import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyParams } from "@/lib/sign";

/**
 * Demo utility (not in the spec's route list): purge a settled/executing split
 * and everything it created — obligations, payments, and ledger txns/entries —
 * so the same TicketMaster order can be run again from a clean state. Users,
 * groups, and saved cards are untouched. Called server-to-server by the
 * merchant's own reset, signed with the shared secret (same trust model as the
 * settlement callback, §7.3).
 */
export async function POST(req: NextRequest) {
  const { sig, external_order_id } = (await req.json()) as {
    sig?: string;
    external_order_id?: string;
  };
  if (!external_order_id || !sig || !verifyParams({ external_order_id }, sig)) {
    return NextResponse.json({ error: "bad signature" }, { status: 403 });
  }

  const split = db
    .prepare("SELECT id FROM splits WHERE external_order_id = ?")
    .get(external_order_id) as { id: string } | undefined;
  if (!split) return NextResponse.json({ ok: true, cleared: false });

  db.transaction(() => {
    db.prepare(
      `DELETE FROM ledger_entries WHERE txn_id IN
         (SELECT id FROM ledger_txns WHERE split_id = ?)`
    ).run(split.id);
    db.prepare("DELETE FROM ledger_txns WHERE split_id = ?").run(split.id);
    db.prepare(
      `DELETE FROM payments WHERE obligation_id IN
         (SELECT id FROM obligations WHERE split_id = ?)`
    ).run(split.id);
    db.prepare("DELETE FROM obligations WHERE split_id = ?").run(split.id);
    db.prepare("DELETE FROM splits WHERE id = ?").run(split.id);
  })();

  return NextResponse.json({ ok: true, cleared: true, split_id: split.id });
}
