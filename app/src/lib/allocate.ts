/**
 * Split totalCents across n members in integer cents.
 * Base share = floor(total / n); remainder cents go to the earliest members
 * (the organizer is first, so they absorb the odd cent — flagged on review).
 * allocate(70000, 3) → [23334, 23333, 23333]
 */
export function allocate(totalCents: number, n: number): number[] {
  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    throw new Error(`allocate: bad total ${totalCents}`);
  }
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`allocate: bad member count ${n}`);
  }
  const base = Math.floor(totalCents / n);
  const remainder = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0));
}
