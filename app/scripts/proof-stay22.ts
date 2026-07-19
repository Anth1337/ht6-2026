/**
 * Phase 0 proof: server-to-server Stay22 Accommodations Search call.
 * Saves the live payload to fixtures/stay22.json for offline fallback.
 * Run: npx tsx --env-file=.env.local scripts/proof-stay22.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = "https://api.stay22.com";

async function main() {
  const params = new URLSearchParams({
    lat: "21.1619",
    lng: "-86.8515", // Cancun
    checkin: "2026-09-10",
    checkout: "2026-09-13",
    adults: "3",
    rooms: "1",
    pageSize: "12",
    currency: "USD",
  });
  const url = `${BASE}/v2/accommodations?${params}`;
  const res = await fetch(url, {
    headers: { "X-API-KEY": process.env.STAY22_API_KEY! },
  });
  console.log(`GET ${url} → ${res.status}`);
  const body = await res.text();
  if (!res.ok) {
    console.error(body.slice(0, 500));
    process.exit(1);
  }
  const json = JSON.parse(body);
  const results = json.results ?? [];
  console.log(`results: ${results.length}`);
  if (results[0]) {
    const l = results[0];
    console.log(`first: ${l.name} — rating ${l.rating?.value}`);
  }
  const out = path.join(process.cwd(), "fixtures", "stay22.json");
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(json, null, 2));
  console.log(`saved → ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
