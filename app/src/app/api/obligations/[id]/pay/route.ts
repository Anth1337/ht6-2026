import { NextRequest, NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { db } from "@/lib/db";
import { repayObligation, RepayError } from "@/lib/engine";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUserApi();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const obligation = db
    .prepare("SELECT user_id, state FROM obligations WHERE id = ?")
    .get(id) as { user_id: string; state: string } | undefined;
  if (!obligation) return NextResponse.json({ error: "not found" }, { status: 404 });
  // §7.4 — repayment requires the obligation owner.
  if (obligation.user_id !== user.id) {
    return NextResponse.json({ error: "not your obligation" }, { status: 403 });
  }

  try {
    const result = await repayObligation(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof RepayError) {
      return NextResponse.json({ error: err.message }, { status: 402 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
