import test from "node:test";
import assert from "node:assert/strict";
import { allocate } from "./allocate";

test("allocate(70000, 3) — spec §13 case", () => {
  assert.deepEqual(allocate(70000, 3), [23334, 23333, 23333]);
});

test("shares always sum to total", () => {
  for (const [total, n] of [
    [70000, 3],
    [100, 3],
    [1, 1],
    [99999, 7],
    [50000, 4],
  ] as const) {
    const shares = allocate(total, n);
    assert.equal(shares.length, n);
    assert.equal(
      shares.reduce((a, b) => a + b, 0),
      total
    );
    // no share differs from another by more than 1 cent
    assert.ok(Math.max(...shares) - Math.min(...shares) <= 1);
  }
});

test("rejects bad input", () => {
  assert.throws(() => allocate(100.5, 2));
  assert.throws(() => allocate(0, 2));
  assert.throws(() => allocate(100, 0));
});
