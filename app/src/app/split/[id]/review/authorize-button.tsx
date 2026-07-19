"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const MFA_ACR = "http://schemas.openid.net/pape/policies/2007/06/multi-factor";

export function AuthorizeButton({
  splitId,
  totalLabel,
}: {
  splitId: string;
  totalLabel: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function authorize() {
    setBusy(true);
    setError(null);
    // Kick off the engine. Errors (authz/MFA) come back immediately; real
    // execution takes seconds — after a short grace period we jump to the
    // live execution screen while the request keeps running server-side.
    const request = fetch(`/api/splits/${splitId}/execute`, { method: "POST" });
    const settled = await Promise.race([
      request,
      new Promise<null>((r) => setTimeout(() => r(null), 500)),
    ]);
    if (settled !== null && !settled.ok) {
      const json = await settled.json().catch(() => ({}));
      if (json.error === "mfa_required") {
        // Step-up: re-authenticate with MFA, then land back on review.
        const returnTo = encodeURIComponent(`/split/${splitId}/review`);
        const acr = encodeURIComponent(MFA_ACR);
        window.location.href = `/auth/login?returnTo=${returnTo}&acr_values=${acr}`;
        return;
      }
      setError(json.error ?? `execute failed (${settled.status})`);
      setBusy(false);
      return;
    }
    router.push(`/split/${splitId}`);
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button size="lg" className="w-full" onClick={authorize} disabled={busy}>
        {busy ? "Authorizing…" : `Authorize ${totalLabel}`}
      </Button>
    </div>
  );
}
