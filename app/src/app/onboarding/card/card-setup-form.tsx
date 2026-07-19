"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

function InnerForm() {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    const { error: confirmError, setupIntent } = await stripe.confirmSetup({
      elements,
      redirect: "if_required",
    });
    if (confirmError || !setupIntent?.payment_method) {
      setError(confirmError?.message ?? "setup failed");
      setBusy(false);
      return;
    }
    const res = await fetch("/api/setup-intent/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payment_method_id: setupIntent.payment_method }),
    });
    if (!res.ok) {
      setError("could not save card");
      setBusy(false);
      return;
    }
    router.push("/dashboard");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <PaymentElement />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={!stripe || busy} className="w-full">
        {busy ? "Saving…" : "Save card"}
      </Button>
    </form>
  );
}

export function CardSetupForm() {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/setup-intent", { method: "POST" })
      .then((r) => r.json())
      .then((j) =>
        j.clientSecret ? setClientSecret(j.clientSecret) : setError(j.error)
      )
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!clientSecret)
    return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <InnerForm />
    </Elements>
  );
}
