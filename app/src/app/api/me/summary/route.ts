import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { db } from "@/lib/db";
import { accountBalance } from "@/lib/ledger";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUserApi();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Debt to SunPay = open balance on this member's receivable account.
  const outstandingCents = accountBalance(`member_receivable:${user.id}`);

  const groups = db
    .prepare(
      `SELECT g.id, g.name, g.invite_code, g.organizer_id, m.cap_cents, m.accepted_at
       FROM memberships m JOIN groups g ON g.id = m.group_id
       WHERE m.user_id = ? ORDER BY g.created_at DESC`
    )
    .all(user.id);

  const obligations = db
    .prepare(
      `SELECT o.*, s.merchant_name, s.total_cents AS split_total_cents, s.state AS split_state
       FROM obligations o JOIN splits s ON s.id = o.split_id
       WHERE o.user_id = ? ORDER BY s.created_at DESC LIMIT 10`
    )
    .all(user.id);

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      card_brand: user.card_brand,
      card_last4: user.card_last4,
      has_card: !!user.payment_method_id,
    },
    outstanding_cents: outstandingCents,
    groups,
    obligations,
  });
}
