"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function JoinButton({
  code,
  defaultCapCents,
}: {
  code: string;
  defaultCapCents: number;
}) {
  const router = useRouter();
  const [capDollars, setCapDollars] = useState((defaultCapCents / 100).toString());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const cap_cents = Math.round(parseFloat(capDollars) * 100);
    const res = await fetch("/api/groups/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invite_code: code, cap_cents }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "could not join");
      return;
    }
    router.push(`/groups/${json.group_id}`);
  }

  return (
    <form onSubmit={join} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="cap">Your budget for this group (USD)</Label>
        <Input
          id="cap"
          type="number"
          min="1"
          step="0.01"
          value={capDollars}
          onChange={(e) => setCapDollars(e.target.value)}
          required
        />
        <p className="text-xs text-muted-foreground">
          Pre-filled with the organizer&rsquo;s suggestion — change it to whatever you
          want. You can adjust it anytime.
        </p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Joining…" : "Accept & authorize"}
      </Button>
    </form>
  );
}
