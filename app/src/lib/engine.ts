import Stripe from "stripe";
import { db } from "./db";
import { newId } from "./id";
import { stripe } from "./stripe";
import { postTransaction } from "./ledger";
import { signParams } from "./sign";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export interface SplitRow {
  id: string;
  group_id: string;
  merchant_name: string;
  external_order_id: string;
  total_cents: number;
  state: string;
  return_url: string | null;
}
interface ObligationRow {
  id: string;
  user_id: string;
  principal_cents: number;
  paid_cents: number;
  split_id: string;
  state: string;
  plan_type: "charge_now" | "plan_30";
}
interface PayerRow {
  stripe_customer_id: string;
  payment_method_id: string;
}

/**
 * The split engine (§6-D2/D3, §7). Caller is responsible for authorization
 * and the MFA check; this function owns the §7.1 atomic guard, the charge
 * loop, the §5 ledger postings, settlement, and the merchant callback.
 */
export async function executeSplit(
  splitId: string
): Promise<{ id: string; state: string; already_running?: boolean }> {
  const split = db.prepare("SELECT * FROM splits WHERE id = ?").get(splitId) as
    | SplitRow
    | undefined;
  if (!split) throw new Error(`split ${splitId} not found`);

  // §7.1 — the atomic draft → executing UPDATE is the only double-run guard.
  const claimed = db
    .prepare("UPDATE splits SET state = 'executing' WHERE id = ? AND state = 'draft'")
    .run(splitId);
  if (claimed.changes === 0) {
    return { id: splitId, state: split.state, already_running: true };
  }

  const obligations = db
    .prepare("SELECT * FROM obligations WHERE split_id = ? ORDER BY rowid")
    .all(splitId) as ObligationRow[];

  for (const o of obligations) {
    const payer = db
      .prepare("SELECT stripe_customer_id, payment_method_id FROM users WHERE id = ?")
      .get(o.user_id) as PayerRow;

    let outcome: "charged" | "floated";

    if (o.plan_type === "plan_30") {
      outcome = "floated"; // opted into the payment plan — no charge attempt
    } else {
      let paymentStatus: "succeeded" | "declined" | "errored";
      let paymentIntentId: string | null = null;
      try {
        const pi = await stripe.paymentIntents.create(
          {
            amount: o.principal_cents,
            currency: "usd",
            customer: payer.stripe_customer_id,
            payment_method: payer.payment_method_id,
            off_session: true,
            confirm: true,
            description: `SunPay split ${split.id} — ${split.merchant_name}`,
            metadata: { split_id: split.id, obligation_id: o.id },
          },
          // §7.2 — idempotency key prevents double charges.
          { idempotencyKey: `${split.id}:${o.id}` }
        );
        paymentIntentId = pi.id;
        paymentStatus = pi.status === "succeeded" ? "succeeded" : "errored";
        outcome = pi.status === "succeeded" ? "charged" : "floated";
      } catch (err) {
        if (err instanceof Stripe.errors.StripeCardError) {
          paymentStatus = "declined";
          paymentIntentId = err.payment_intent?.id ?? null;
        } else {
          paymentStatus = "errored";
        }
        outcome = "floated"; // the float covers the share either way
      }
      db.prepare(
        `INSERT INTO payments (id, obligation_id, amount_cents, stripe_payment_intent_id, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(newId("pay"), o.id, o.principal_cents, paymentIntentId, paymentStatus, Date.now());
    }

    if (outcome === "charged") {
      postTransaction("member_charge", split.id, [
        { account: "cash", direction: "debit", amountCents: o.principal_cents },
        { account: `member_funds_held:${o.user_id}`, direction: "credit", amountCents: o.principal_cents },
      ]);
      db.prepare(
        "UPDATE obligations SET state = 'charged', paid_cents = principal_cents WHERE id = ?"
      ).run(o.id);
    } else {
      // §5 float recipe: SunPay's float funds the share; the member owes it back.
      postTransaction("float_advance", split.id, [
        { account: "cash", direction: "debit", amountCents: o.principal_cents },
        { account: "float_payable", direction: "credit", amountCents: o.principal_cents },
        { account: `member_receivable:${o.user_id}`, direction: "debit", amountCents: o.principal_cents },
        { account: `member_funds_held:${o.user_id}`, direction: "credit", amountCents: o.principal_cents },
      ]);
      db.prepare(
        "UPDATE obligations SET state = 'floated', due_date = ? WHERE id = ?"
      ).run(Date.now() + THIRTY_DAYS_MS, o.id);
    }
  }

  // §5 settlement: sweep funds-held into the merchant payable, then pay out.
  postTransaction("merchant_settlement", split.id, [
    ...obligations.map((o) => ({
      account: `member_funds_held:${o.user_id}`,
      direction: "debit" as const,
      amountCents: o.principal_cents,
    })),
    { account: `merchant_payable:${split.id}`, direction: "credit", amountCents: split.total_cents },
  ]);
  postTransaction("merchant_settlement", split.id, [
    { account: `merchant_payable:${split.id}`, direction: "debit", amountCents: split.total_cents },
    { account: "cash", direction: "credit", amountCents: split.total_cents },
  ]);
  db.prepare("UPDATE splits SET state = 'settled' WHERE id = ?").run(splitId);

  // §7.3 — signed server-to-server callback flips the merchant order.
  const callbackUrl = process.env.MERCHANT_CALLBACK_URL;
  if (callbackUrl) {
    const payload = {
      external_order_id: split.external_order_id,
      split_id: split.id,
      amount_cents: split.total_cents,
      status: "settled",
    };
    try {
      await fetch(callbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, sig: signParams(payload) }),
      });
    } catch (err) {
      console.error("merchant callback failed:", err);
    }
  }

  return { id: splitId, state: "settled" };
}

/**
 * Journey E repayment. Caller checks ownership; this charges an alternate
 * stored card (falling back to the default) and posts the §5 repayment
 * recipe. Throws { declined: true } shape via RepayError on card failure.
 */
export class RepayError extends Error {
  declined: boolean;
  constructor(message: string, declined: boolean) {
    super(message);
    this.declined = declined;
  }
}

export async function repayObligation(
  obligationId: string
): Promise<{ paid_cents: number }> {
  const obligation = db
    .prepare("SELECT * FROM obligations WHERE id = ?")
    .get(obligationId) as ObligationRow | undefined;
  if (!obligation) throw new Error("obligation not found");
  if (obligation.state !== "floated") {
    throw new Error(`nothing to repay (state ${obligation.state})`);
  }
  const remaining = obligation.principal_cents - obligation.paid_cents;
  if (remaining <= 0) throw new Error("already repaid");

  const payer = db
    .prepare("SELECT stripe_customer_id, payment_method_id FROM users WHERE id = ?")
    .get(obligation.user_id) as PayerRow;

  // Pay with an alternate stored card when one exists (the default is the
  // card that declined); otherwise retry the default.
  const pms = await stripe.paymentMethods.list({
    customer: payer.stripe_customer_id,
    type: "card",
  });
  const alternate =
    pms.data.find((pm) => pm.id !== payer.payment_method_id) ?? pms.data[0];
  if (!alternate) throw new RepayError("no stored card", false);

  let pi: Stripe.PaymentIntent;
  try {
    pi = await stripe.paymentIntents.create(
      {
        amount: remaining,
        currency: "usd",
        customer: payer.stripe_customer_id,
        payment_method: alternate.id,
        off_session: true,
        confirm: true,
        description: `SunPay repayment ${obligation.id}`,
        metadata: { obligation_id: obligation.id, split_id: obligation.split_id },
      },
      { idempotencyKey: `repay:${obligation.id}:${obligation.paid_cents}` }
    );
  } catch (err) {
    const declined = err instanceof Stripe.errors.StripeCardError;
    db.prepare(
      `INSERT INTO payments (id, obligation_id, amount_cents, stripe_payment_intent_id, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      newId("pay"),
      obligation.id,
      remaining,
      declined && err instanceof Stripe.errors.StripeCardError
        ? (err.payment_intent?.id ?? null)
        : null,
      declined ? "declined" : "errored",
      Date.now()
    );
    throw new RepayError(declined ? "card declined" : "payment error", declined);
  }

  db.prepare(
    `INSERT INTO payments (id, obligation_id, amount_cents, stripe_payment_intent_id, status, created_at)
     VALUES (?, ?, ?, ?, 'succeeded', ?)`
  ).run(newId("pay"), obligation.id, remaining, pi.id, Date.now());

  // §5 repayment recipe: clear the receivable, then unwind the float.
  postTransaction("repayment", obligation.split_id, [
    { account: "cash", direction: "debit", amountCents: remaining },
    { account: `member_receivable:${obligation.user_id}`, direction: "credit", amountCents: remaining },
    { account: "float_payable", direction: "debit", amountCents: remaining },
    { account: "cash", direction: "credit", amountCents: remaining },
  ]);
  db.prepare(
    "UPDATE obligations SET paid_cents = principal_cents, state = 'settled' WHERE id = ?"
  ).run(obligation.id);

  return { paid_cents: remaining };
}
