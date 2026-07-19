import { NextRequest, NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const user = await requireUserApi();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { invite_code } = (await req.json()) as { invite_code?: string };
  if (!invite_code) {
    return NextResponse.json({ error: "invite_code required" }, { status: 400 });
  }
  const group = db
    .prepare("SELECT * FROM groups WHERE invite_code = ?")
    .get(invite_code.trim().toUpperCase()) as
    | { id: string; organizer_id: string }
    | undefined;
  if (!group) {
    return NextResponse.json({ error: "invalid invite code" }, { status: 404 });
  }

  const existing = db
    .prepare("SELECT * FROM memberships WHERE group_id = ? AND user_id = ?")
    .get(group.id, user.id) as { accepted_at: number | null } | undefined;

  if (existing?.accepted_at) {
    return NextResponse.json({ group_id: group.id, already_member: true });
  }
  if (existing) {
    db.prepare(
      "UPDATE memberships SET accepted_at = ? WHERE group_id = ? AND user_id = ?"
    ).run(Date.now(), group.id, user.id);
  } else {
    // Uniform cap: copy the organizer's cap (set at group creation).
    const organizerCap = db
      .prepare("SELECT cap_cents FROM memberships WHERE group_id = ? AND user_id = ?")
      .get(group.id, group.organizer_id) as { cap_cents: number };
    db.prepare(
      "INSERT INTO memberships (group_id, user_id, cap_cents, accepted_at) VALUES (?, ?, ?, ?)"
    ).run(group.id, user.id, organizerCap.cap_cents, Date.now());
  }
  return NextResponse.json({ group_id: group.id });
}
