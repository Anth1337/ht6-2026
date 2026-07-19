import { NextRequest, NextResponse } from "next/server";
import { requireUserApi, isMember } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUserApi();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const split = db.prepare("SELECT * FROM splits WHERE id = ?").get(id) as
    | { id: string; group_id: string }
    | undefined;
  if (!split) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!isMember(split.group_id, user.id)) {
    return NextResponse.json({ error: "not a member" }, { status: 403 });
  }

  const obligations = db
    .prepare(
      `SELECT o.id, o.user_id, o.principal_cents, o.plan_type, o.paid_cents, o.due_date, o.state,
              u.name, u.email, u.card_brand, u.card_last4,
              (SELECT p.status FROM payments p WHERE p.obligation_id = o.id
               ORDER BY p.created_at DESC LIMIT 1) AS last_payment_status
       FROM obligations o JOIN users u ON u.id = o.user_id
       WHERE o.split_id = ? ORDER BY o.rowid`
    )
    .all(id);

  return NextResponse.json({ split, obligations });
}
