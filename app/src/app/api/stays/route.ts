import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { requireUserApi, isMember } from "@/lib/auth";
import { db } from "@/lib/db";
import { allocate } from "@/lib/allocate";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 60 * 60 * 1000; // 60-minute in-memory cache (spec §3)

interface Stay22Listing {
  id: string;
  name: string;
  type: string;
  rating?: { value: number | null; hotelStars: number | null; count: number | null };
  location?: { address?: string };
  media?: { thumbnail?: string };
  capacity?: { guests?: number };
  url?: string;
  suppliers?: Record<string, { price?: { total?: number }; link?: string }>;
}
interface Stay22Response {
  meta?: { nights?: number; currency?: string };
  results?: Stay22Listing[];
}

const g = globalThis as unknown as {
  __stay22Cache?: Map<string, { at: number; data: Stay22Response; live: boolean }>;
};
const cache = (g.__stay22Cache ??= new Map());

export async function fetchStays(
  qs: URLSearchParams
): Promise<{ data: Stay22Response; live: boolean }> {
  const key = qs.toString();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return { data: hit.data, live: hit.live };
  }
  try {
    const res = await fetch(`https://api.stay22.com/v2/accommodations?${key}`, {
      headers: { "X-API-KEY": process.env.STAY22_API_KEY! },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`stay22 ${res.status}`);
    const data = (await res.json()) as Stay22Response;
    cache.set(key, { at: Date.now(), data, live: true });
    return { data, live: true };
  } catch {
    // Offline fallback — the Phase 0 fixture (spec §3).
    const data = JSON.parse(
      readFileSync(path.join(process.cwd(), "fixtures", "stay22.json"), "utf8")
    ) as Stay22Response;
    cache.set(key, { at: Date.now(), data, live: false });
    return { data, live: false };
  }
}

export async function GET(req: NextRequest) {
  const user = await requireUserApi();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const groupId = sp.get("groupId");
  if (!groupId || !isMember(groupId, user.id)) {
    return NextResponse.json({ error: "not a member" }, { status: 403 });
  }

  const members = db
    .prepare(
      `SELECT m.user_id, m.cap_cents, u.name, u.email
       FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.group_id = ? AND m.accepted_at IS NOT NULL ORDER BY m.rowid`
    )
    .all(groupId) as { user_id: string; cap_cents: number; name: string | null; email: string }[];
  const n = members.length;

  // Location: address search or lat/lng (defaults: Cancun, a month out, 3 nights).
  const qs = new URLSearchParams({
    checkin: sp.get("checkin") ?? new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
    checkout: sp.get("checkout") ?? new Date(Date.now() + 33 * 864e5).toISOString().slice(0, 10),
    adults: String(n),
    rooms: "1",
    pageSize: "12",
    currency: "USD",
  });
  const address = sp.get("address");
  if (address) qs.set("address", address);
  else {
    qs.set("lat", "21.1619");
    qs.set("lng", "-86.8515");
  }

  const { data, live } = await fetchStays(qs);
  const nights = data.meta?.nights ?? 1;

  const listings = (data.results ?? [])
    .map((l) => {
      // Cheapest supplier drives the price and the outbound booking link.
      const suppliers = Object.entries(l.suppliers ?? {})
        .filter(([, s]) => (s.price?.total ?? 0) > 0)
        .sort((a, b) => (a[1].price!.total ?? 0) - (b[1].price!.total ?? 0));
      if (suppliers.length === 0) return null;
      const [provider, cheapest] = suppliers[0];
      const totalCents = Math.round(cheapest.price!.total! * 100);
      const shares = allocate(totalCents, n);
      const maxShare = Math.max(...shares);
      const overBudget = members.filter((m) => maxShare > m.cap_cents);
      return {
        id: l.id,
        name: l.name,
        type: l.type,
        address: l.location?.address ?? null,
        thumbnail: l.media?.thumbnail ?? null,
        stars: l.rating?.hotelStars ?? null,
        guest_rating: l.rating?.value ?? null,
        total_cents: totalCents,
        per_person_cents: maxShare,
        nights,
        provider,
        // Read-only outbound link to the provider — never flows into the
        // payment engine (spec §6-C).
        book_url: cheapest.link ?? l.url ?? null,
        locked: overBudget.length > 0,
        over_budget_count: overBudget.length,
      };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);

  return NextResponse.json({ listings, live, nights, member_count: n });
}
