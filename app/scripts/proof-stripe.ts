/**
 * Phase 0 proof: one off-session Stripe charge, success + decline paths.
 * Run: npx tsx --env-file=.env.local scripts/proof-stripe.ts
 */
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

async function chargeOffSession(label: string, testPm: string) {
  const customer = await stripe.customers.create({ name: `proof-${label}` });
  const pm = await stripe.paymentMethods.attach(testPm, {
    customer: customer.id,
  });
  try {
    const pi = await stripe.paymentIntents.create(
      {
        amount: 23334,
        currency: "usd",
        customer: customer.id,
        payment_method: pm.id,
        off_session: true,
        confirm: true,
      },
      { idempotencyKey: `proof:${customer.id}` }
    );
    console.log(`${label}: ${pi.status} (${pi.id})`);
  } catch (err) {
    if (err instanceof Stripe.errors.StripeCardError) {
      console.log(`${label}: declined (${err.code}) — expected for decline proof`);
    } else {
      throw err;
    }
  }
}

async function main() {
  await chargeOffSession("success-path", "pm_card_visa");
  // pm_card_chargeCustomerFail: attach succeeds, off-session charges decline —
  // exactly Carol's story. (pm_card_visa_chargeDeclined declines at attach.)
  await chargeOffSession("decline-path", "pm_card_chargeCustomerFail");
  console.log("Stripe proof complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
