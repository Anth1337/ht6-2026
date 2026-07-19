/**
 * §13: Stay22 renders from the fixture with the network unplugged.
 * Simulates network failure by breaking global fetch, then asserts the
 * proxy serves fixtures/stay22.json.
 * Run: npx tsx --env-file=.env.local scripts/verify-stays-fallback.ts
 */
import assert from "node:assert/strict";

globalThis.fetch = (async () => {
  throw new Error("network unplugged (simulated)");
}) as typeof fetch;

async function main() {
  const { fetchStays } = await import("../src/app/api/stays/route");
  const { data, live } = await fetchStays(
    new URLSearchParams({ lat: "21.1619", lng: "-86.8515", pageSize: "12" })
  );
  assert.equal(live, false, "expected fixture fallback, got live");
  assert.ok((data.results ?? []).length > 0, "fixture returned no listings");
  const withPrice = data.results!.filter((l) =>
    Object.values(l.suppliers ?? {}).some((s) => (s.price?.total ?? 0) > 0)
  );
  assert.ok(withPrice.length > 0, "no priced listings in fixture");
  console.log(
    `fixture fallback ✓ (${data.results!.length} listings, ${withPrice.length} priced, offline)`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
