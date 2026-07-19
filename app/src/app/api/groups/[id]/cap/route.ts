import { NextRequest, NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { db } from "@/lib/db";

// Each member owns their own per-group budget. The `user_id = user.id` clause
// in the UPDATE is the authorization: you can only change your own cap, and
// only in a group you belong to (0 rows changed → not a member).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUserApi();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const { cap_cents } = (await req.json()) as { cap_cents?: number };
  if (!Number.isInteger(cap_cents) || cap_cents! <= 0) {
    return NextResponse.json(
      { error: "cap_cents must be a positive integer" },
      { status: 400 }
    );
  }

  const info = db
    .prepare("UPDATE memberships SET cap_cents = ? WHERE group_id = ? AND user_id = ?")
    .run(cap_cents, id, user.id);
  if (info.changes === 0) {
    return NextResponse.json(
      { error: "not a member of this group" },
      { status: 403 }
    );
  }

  return NextResponse.json({ ok: true, cap_cents });
}
