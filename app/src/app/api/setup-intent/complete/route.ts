import { NextRequest, NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const user = await requireUserApi();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { payment_method_id } = (await req.json()) as {
    payment_method_id?: string;
  };
  if (!payment_method_id) {
    return NextResponse.json({ error: "payment_method_id required" }, { status: 400 });
  }

  const pm = await stripe.paymentMethods.retrieve(payment_method_id);
  if (pm.customer !== user.stripe_customer_id) {
    return NextResponse.json({ error: "payment method not owned" }, { status: 403 });
  }

  db.prepare(
    "UPDATE users SET payment_method_id = ?, card_brand = ?, card_last4 = ? WHERE id = ?"
  ).run(pm.id, pm.card?.brand ?? null, pm.card?.last4 ?? null, user.id);

  return NextResponse.json({ ok: true });
}
