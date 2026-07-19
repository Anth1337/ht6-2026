import test from "node:test";
import assert from "node:assert/strict";
import { openDb } from "./db";
import { postTransaction, balances, accountBalance, isBalanced } from "./ledger";

function memDb() {
  return openDb(":memory:");
}

test("balanced txn posts and sums", () => {
  const db = memDb();
  postTransaction(
    "member_charge",
    "spl_test",
    [
      { account: "cash", direction: "debit", amountCents: 23334 },
      { account: "member_funds_held:u1", direction: "credit", amountCents: 23334 },
    ],
    db
  );
  assert.equal(accountBalance("cash", db), 23334);
  assert.equal(accountBalance("member_funds_held:u1", db), -23334);
  assert.equal(isBalanced(db), true);
  assert.deepEqual(balances(db), {
    cash: 23334,
    "member_funds_held:u1": -23334,
  });
});

test("unbalanced txn throws and posts nothing", () => {
  const db = memDb();
  assert.throws(
    () =>
      postTransaction(
        "member_charge",
        null,
        [
          { account: "cash", direction: "debit", amountCents: 100 },
          { account: "float_payable", direction: "credit", amountCents: 99 },
        ],
        db
      ),
    /unbalanced/
  );
  assert.equal(Object.keys(balances(db)).length, 0);
});

test("rejects zero/negative/float amounts", () => {
  const db = memDb();
  for (const bad of [0, -5, 10.5]) {
    assert.throws(() =>
      postTransaction(
        "repayment",
        null,
        [
          { account: "cash", direction: "debit", amountCents: bad },
          { account: "x", direction: "credit", amountCents: bad },
        ],
        db
      )
    );
  }
});
