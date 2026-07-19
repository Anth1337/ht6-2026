import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { signParams } from "@/lib/sign";

export async function GET(req: NextRequest) {
  const hotel = req.nextUrl.searchParams.get("hotel")?.trim();
  const amountCents = Number(req.nextUrl.searchParams.get("total_cents"));
  const nights = Number(req.nextUrl.searchParams.get("nights"));
  if (
    !hotel ||
    hotel.length > 200 ||
    !Number.isSafeInteger(amountCents) ||
    amountCents <= 0 ||
    !Number.isSafeInteger(nights) ||
    nights < 1
  ) {
    return NextResponse.json({ error: "invalid hotel booking" }, { status: 400 });
  }

  const externalOrderId = `HTL-${randomUUID()}`;
  const confirmation = new URL("/hotel-demo/confirmation", req.url);
  confirmation.searchParams.set("hotel", hotel);
  confirmation.searchParams.set("nights", String(nights));
  confirmation.searchParams.set("total_cents", String(amountCents));
  confirmation.searchParams.set("external_order_id", externalOrderId);

  const params = {
    merchant_name: "Booking.com demo",
    external_order_id: externalOrderId,
    amount_cents: amountCents,
    return_url: confirmation.toString(),
  };
  const handoff = new URL("/split/new", req.url);
  for (const [key, value] of Object.entries(params)) handoff.searchParams.set(key, String(value));
  handoff.searchParams.set("sig", signParams(params));
  return NextResponse.json({ url: handoff.toString() });
}
