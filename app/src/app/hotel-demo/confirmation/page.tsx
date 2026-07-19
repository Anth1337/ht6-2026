import { requireUserPage } from "@/lib/auth";
import { db } from "@/lib/db";

function money(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

export default async function HotelConfirmation({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUserPage();
  const params = await searchParams;
  const orderId = params.external_order_id ?? "";
  const split = db.prepare("SELECT state FROM splits WHERE external_order_id = ?").get(orderId) as { state: string } | undefined;
  const confirmed = split?.state === "settled";
  return <main className="min-h-screen bg-[#f5f5f5] p-5 text-[#1a1a1a]"><header className="mx-auto max-w-2xl bg-[#003b95] px-6 py-4 text-2xl font-extrabold text-white">Booking<span className="text-[#febb02]">.com</span> <span className="text-xs text-[#febb02]">DEMO</span></header><section className="mx-auto max-w-2xl rounded-b-lg border bg-white p-6 shadow-sm"><p className="text-xs font-bold uppercase text-neutral-500">Booking status</p><h1 className="mt-2 text-2xl font-bold">{params.hotel ?? "SunPay Hotel Demo"}</h1><p className="mt-2 text-neutral-600">{params.nights ?? ""} nights · {money(Number(params.total_cents ?? 0))}</p><p className={`mt-5 inline-block rounded-full px-3 py-2 text-sm font-bold ${confirmed ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>{confirmed ? "Booking confirmed ✓ — Paid via SunPay" : "Booking payment is still processing…"}</p></section></main>;
}
