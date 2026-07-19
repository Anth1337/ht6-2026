import { NextRequest, NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { db } from "@/lib/db";
import { newId } from "@/lib/id";
import { allocate } from "@/lib/allocate";
import { verifyParams } from "@/lib/sign";

interface Body {
  merchant_name?: string;
  external_order_id?: string;
  amount_cents?: number;
  return_url?: string;
  sig?: string;
  group_id?: string;
}

interface MemberRow {
  user_id: string;
  cap_cents: number;
  default_plan: "charge_now" | "plan_30";
  payment_method_id: string | null;
}

export async function POST(req: NextRequest) {
  const user = await requireUserApi();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as Body;
  const { merchant_name, external_order_id, amount_cents, return_url, sig, group_id } = body;
  if (!merchant_name || !external_order_id || !amount_cents || !group_id) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  // §7.3 — the SDK handoff is signed over the merchant-controlled fields.
  const signed = {
    merchant_name,
    external_order_id,
    amount_cents,
    return_url: return_url ?? "",
  };
  if (!sig || !verifyParams(signed, sig)) {
    return NextResponse.json({ error: "bad signature" }, { status: 403 });
  }

  const group = db.prepare("SELECT * FROM groups WHERE id = ?").get(group_id) as
    | { id: string; organizer_id: string }
    | undefined;
  if (!group) return NextResponse.json({ error: "group not found" }, { status: 404 });
  if (group.organizer_id !== user.id) {
    return NextResponse.json({ error: "only the organizer can start a split" }, { status: 403 });
  }

  // Organizer first (absorbs odd cents), then members by accepted_at.
  const members = db
    .prepare(
      `SELECT m.user_id, m.cap_cents, u.default_plan, u.payment_method_id
       FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.group_id = ? AND m.accepted_at IS NOT NULL
       ORDER BY (m.user_id = ?) DESC, m.accepted_at, m.rowid`
    )
    .all(group_id, group.organizer_id) as MemberRow[];
  if (members.length === 0) {
    return NextResponse.json({ error: "no accepted members" }, { status: 400 });
  }

  const shares = allocate(amount_cents, members.length);
  // §7.4 — caps and saved cards validated server-side.
  for (let i = 0; i < members.length; i++) {
    if (shares[i] > members[i].cap_cents) {
      return NextResponse.json(
        { error: `share exceeds a member's cap` },
        { status: 400 }
      );
    }
    if (!members[i].payment_method_id) {
      return NextResponse.json(
        { error: "a member has no saved card" },
        { status: 400 }
      );
    }
  }

  // Idempotent re-entry: an existing draft for this order is replaced;
  // an executing/settled split is returned as-is (§7.1 protects execution).
  const existing = db
    .prepare("SELECT id, state FROM splits WHERE external_order_id = ?")
    .get(external_order_id) as { id: string; state: string } | undefined;
  if (existing && existing.state !== "draft") {
    return NextResponse.json({ id: existing.id, state: existing.state });
  }

  const splitId = existing?.id ?? newId("spl");
  db.transaction(() => {
    if (existing) {
      db.prepare("DELETE FROM obligations WHERE split_id = ?").run(existing.id);
      db.prepare(
        "UPDATE splits SET group_id = ?, merchant_name = ?, total_cents = ?, return_url = ? WHERE id = ?"
      ).run(group_id, merchant_name, amount_cents, return_url ?? null, existing.id);
    } else {
      db.prepare(
        `INSERT INTO splits (id, group_id, merchant_name, external_order_id, total_cents, state, return_url, created_at)
         VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)`
      ).run(splitId, group_id, merchant_name, external_order_id, amount_cents, return_url ?? null, Date.now());
    }
    const insertObligation = db.prepare(
      `INSERT INTO obligations (id, split_id, user_id, principal_cents, plan_type, state)
       VALUES (?, ?, ?, ?, ?, 'pending')`
    );
    members.forEach((m, i) => {
      insertObligation.run(newId("obl"), splitId, m.user_id, shares[i], m.default_plan);
    });
  })();

  return NextResponse.json({ id: splitId, state: "draft" });
}
