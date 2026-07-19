"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function PayNowButton({
  obligationId,
  amountLabel,
}: {
  obligationId: string;
  amountLabel: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/obligations/${obligationId}/pay`, {
      method: "POST",
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "payment failed");
      return;
    }
    router.refresh();
  }

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <Button size="sm" onClick={pay} disabled={busy}>
        {busy ? "Paying…" : `Pay now ${amountLabel}`}
      </Button>
    </span>
  );
}
