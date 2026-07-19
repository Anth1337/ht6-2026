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

  if (!isMember(id, user.id)) {
    return NextResponse.json({ error: "not a member" }, { status: 403 });
  }
  const group = db.prepare("SELECT * FROM groups WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!group) return NextResponse.json({ error: "not found" }, { status: 404 });

  const roster = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.card_brand, u.card_last4, m.cap_cents, m.accepted_at
       FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.group_id = ?
       ORDER BY (u.id = ?) DESC, m.accepted_at, m.rowid`
    )
    .all(id, group.organizer_id as string);

  const allAccepted = (roster as { accepted_at: number | null }[]).every(
    (r) => r.accepted_at !== null
  );

  return NextResponse.json({ group, roster, all_accepted: allAccepted });
}
