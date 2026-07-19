import { NextRequest, NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const user = await requireUserApi();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { invite_code, cap_cents } = (await req.json()) as {
    invite_code?: string;
    cap_cents?: number;
  };
  if (!invite_code) {
    return NextResponse.json({ error: "invite_code required" }, { status: 400 });
  }
  // The joiner sets their own budget; it's optional (omitted → keep the
  // organizer's cap as the default), but if present it must be valid.
  if (cap_cents !== undefined && (!Number.isInteger(cap_cents) || cap_cents <= 0)) {
    return NextResponse.json(
      { error: "cap_cents must be a positive integer" },
      { status: 400 }
    );
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
    // Accept; also apply the joiner's chosen budget if they set one.
    if (cap_cents !== undefined) {
      db.prepare(
        "UPDATE memberships SET accepted_at = ?, cap_cents = ? WHERE group_id = ? AND user_id = ?"
      ).run(Date.now(), cap_cents, group.id, user.id);
    } else {
      db.prepare(
        "UPDATE memberships SET accepted_at = ? WHERE group_id = ? AND user_id = ?"
      ).run(Date.now(), group.id, user.id);
    }
  } else {
    // Use the joiner's chosen budget; default to the organizer's cap (set at
    // group creation) when they didn't specify one.
    let cap = cap_cents;
    if (cap === undefined) {
      const organizerCap = db
        .prepare("SELECT cap_cents FROM memberships WHERE group_id = ? AND user_id = ?")
        .get(group.id, group.organizer_id) as { cap_cents: number };
      cap = organizerCap.cap_cents;
    }
    db.prepare(
      "INSERT INTO memberships (group_id, user_id, cap_cents, accepted_at) VALUES (?, ?, ?, ?)"
    ).run(group.id, user.id, cap, Date.now());
  }
  return NextResponse.json({ group_id: group.id });
}
