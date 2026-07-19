"use client";

import { BedDouble, CalendarDays, ChevronDown, CreditCard, MapPin, ShieldCheck, Star, Users } from "lucide-react";
import { useState } from "react";

function money(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

export function HotelDemoCheckout({ params }: { params: Record<string, string | undefined> }) {
  const searchParams = new URLSearchParams(
    Object.entries(params).filter((entry): entry is [string, string] => entry[1] !== undefined)
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hotel = searchParams.get("hotel") ?? "SunPay Hotel Demo";
  const totalCents = Number(searchParams.get("total_cents"));
  const nights = Number(searchParams.get("nights"));
  const address = searchParams.get("address") ?? "Selected Stay22 accommodation";
  const image = searchParams.get("image");
  const valid = Number.isSafeInteger(totalCents) && totalCents > 0 && Number.isSafeInteger(nights) && nights > 0;

  async function splitWithSunPay() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/hotel-demo/handoff?${searchParams.toString()}`);
      const json = await response.json();
      if (!response.ok || !json.url) throw new Error(json.error ?? "Could not start checkout");
      window.location.assign(json.url);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f5f5] pb-12 text-[#262626]">
      <header className="bg-[#003b95] text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2 text-[27px] font-extrabold tracking-[-1.4px]">Booking<span className="text-[#febb02]">.com</span><span className="ml-1 rounded border border-[#febb02] px-1.5 py-0.5 text-[10px] font-bold tracking-normal text-[#febb02]">DEMO</span></div>
          <div className="hidden items-center gap-5 text-sm font-semibold sm:flex"><span>USD</span><span>Help</span><span className="rounded border border-white/70 px-3 py-2">List your property</span><span className="rounded-full bg-white/15 px-3 py-2">KD</span></div>
        </div>
        <div className="border-t border-white/15"><div className="mx-auto flex max-w-6xl gap-6 px-5 py-3 text-sm font-semibold"><span className="border-b-2 border-[#febb02] pb-3">Stays</span><span>Flights</span><span>Car rentals</span><span>Attractions</span></div></div>
      </header>
      <div className="mx-auto max-w-6xl px-5 pt-6">
        <p className="mb-5 text-sm text-[#0071c2]">Home › Stays › {hotel} › <span className="text-neutral-500">Complete your booking</span></p>
        <h1 className="mb-5 text-2xl font-bold">Complete your booking</h1>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            <section className="overflow-hidden rounded-lg border border-neutral-300 bg-white shadow-sm">
              <div className="flex flex-col sm:flex-row">
                {image ? <>
                  {/* Stay22 supplies this remote property thumbnail. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image} alt={hotel} className="h-44 w-full object-cover sm:w-52" />
                </> : <div className="flex h-44 w-full items-center justify-center bg-[linear-gradient(135deg,#74a9bf,#d8e3d5)] text-5xl sm:w-52">🏨</div>}
                <div className="p-5"><p className="mb-1 text-xs font-bold text-[#0071c2]">PROPERTY YOU SELECTED</p><h2 className="text-xl font-bold text-[#003b95]">{hotel}</h2><div className="mt-2 flex items-center gap-1 text-[#febb02]"><Star size={15} fill="currentColor" /><Star size={15} fill="currentColor" /><Star size={15} fill="currentColor" /><Star size={15} fill="currentColor" /><span className="ml-2 rounded bg-[#003b95] px-1.5 py-0.5 text-xs font-bold text-white">8.6</span><span className="ml-1 text-xs font-semibold text-neutral-700">Excellent</span></div><p className="mt-3 flex items-start gap-1 text-sm text-neutral-600"><MapPin size={16} className="mt-0.5 shrink-0 text-[#0071c2]" />{address}</p></div>
              </div>
            </section>
            <section className="rounded-lg border border-neutral-300 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-bold">Your booking details</h2>
              <div className="mt-4 grid gap-4 border-y py-4 sm:grid-cols-2"><div className="flex gap-3"><CalendarDays className="mt-1 text-[#0071c2]" size={20} /><div><p className="font-bold">Check-in</p><p className="text-sm">Flexible dates</p><p className="text-xs text-neutral-500">From 3:00 PM</p></div></div><div className="flex gap-3"><BedDouble className="mt-1 text-[#0071c2]" size={20} /><div><p className="font-bold">Length of stay</p><p className="text-sm">{nights} night{nights === 1 ? "" : "s"}</p><p className="text-xs text-neutral-500">1 room · 1 stay</p></div></div></div>
              <div className="mt-4 flex gap-3 rounded bg-[#ebf3ff] p-3 text-sm"><Users className="shrink-0 text-[#0071c2]" size={20} /><p><strong>Good to know:</strong> Your SunPay group will be selected in the next step, where the total is split among members.</p></div>
            </section>
            <section className="rounded-lg border border-neutral-300 bg-white p-5 shadow-sm"><h2 className="text-xl font-bold">How would you like to pay?</h2><p className="mt-1 text-sm text-neutral-600">Your payment information is secured and encrypted.</p>{valid ? <div className="mt-4 space-y-3"><button className="flex w-full items-center justify-between rounded border border-neutral-300 p-4 text-left hover:border-[#0071c2]" onClick={() => alert("Card checkout is out of scope for this demo — use Split with SunPay.")}><span className="flex items-center gap-3"><span className="rounded bg-neutral-100 p-2"><CreditCard size={20} /></span><span><strong>Pay by card</strong><small className="mt-0.5 block text-neutral-500">Visa, Mastercard, American Express</small></span></span><ChevronDown size={20} /></button><button className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-[#0d0d0d] px-6 py-3.5 text-base font-bold text-[#f5efe3] shadow-sm hover:bg-[#1a1a1a] disabled:opacity-60" disabled={busy} onClick={splitWithSunPay}>{busy ? "Connecting to SunPay…" : <><span>Split with</span><span className="inline-flex items-center rounded-lg bg-[#fdf8ee] px-2.5 py-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/sunpay-wordmark.png" alt="SunPay" className="block h-6" />
        </span></>}</button></div> : <p className="mt-3 text-red-600">This demo booking is missing valid stay details.</p>}{error && <p className="mt-3 text-sm text-red-600">{error}</p>}</section>
          </div>
          <aside className="space-y-4 lg:sticky lg:top-5"><section className="rounded-lg border border-neutral-300 bg-white p-5 shadow-sm"><h2 className="text-lg font-bold">Your price summary</h2><div className="mt-4 space-y-3 border-b pb-4 text-sm"><div className="flex justify-between"><span>{nights} night{nights === 1 ? "" : "s"}</span><span>{valid ? money(totalCents) : "—"}</span></div><div className="flex justify-between text-neutral-600"><span>Taxes and fees</span><span>Included</span></div></div><div className="flex justify-between pt-4 text-lg font-bold"><span>Total</span><span>{valid ? money(totalCents) : "—"}</span></div><p className="mt-1 text-xs text-neutral-500">Price is in USD and includes applicable taxes and charges.</p></section><section className="rounded-lg border border-[#8dc0ff] bg-[#f0f7ff] p-4 text-sm"><div className="flex gap-3"><ShieldCheck className="shrink-0 text-[#0071c2]" size={22} /><div><p className="font-bold">Secure booking</p><p className="mt-1 text-neutral-600">Your booking details are protected with industry-standard encryption.</p></div></div></section><p className="px-2 text-xs text-neutral-500">By selecting a payment option, you agree to the demo property&apos;s terms and the SunPay payment flow.</p></aside>
        </div>
      </div>
      <footer className="mx-auto mt-10 max-w-6xl border-t px-5 py-6 text-center text-xs text-neutral-500">Demo hotel storefront — not affiliated with Booking.com. Stripe test mode; no real money moves.</footer>
    </main>
  );
}
