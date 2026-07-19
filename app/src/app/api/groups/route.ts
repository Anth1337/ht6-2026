import { NextRequest, NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { db } from "@/lib/db";
import { newId } from "@/lib/id";
import { randomBytes } from "node:crypto";

function inviteCode(): string {
  // 7 chars, unambiguous uppercase alphanumerics
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from(randomBytes(7), (b) => alphabet[b % alphabet.length]).join("");
}

export async function POST(req: NextRequest) {
  const user = await requireUserApi();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { name, cap_cents } = (await req.json()) as {
    name?: string;
    cap_cents?: number;
  };
  if (!name?.trim()) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  if (!Number.isInteger(cap_cents) || cap_cents! <= 0) {
    return NextResponse.json(
      { error: "cap_cents must be a positive integer" },
      { status: 400 }
    );
  }

  const id = newId("grp");
  const code = inviteCode();
  db.transaction(() => {
    db.prepare(
      "INSERT INTO groups (id, organizer_id, name, invite_code, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(id, user.id, name.trim(), code, Date.now());
    // Organizer joins immediately; their cap is the group's uniform cap,
    // copied to each member on join.
    db.prepare(
      "INSERT INTO memberships (group_id, user_id, cap_cents, accepted_at) VALUES (?, ?, ?, ?)"
    ).run(id, user.id, cap_cents, Date.now());
  })();

  return NextResponse.json({ id, invite_code: code });
}
