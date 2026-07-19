"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function NewGroupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [capDollars, setCapDollars] = useState("500");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const capCents = Math.round(parseFloat(capDollars) * 100);
    const res = await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, cap_cents: capCents }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "could not create group");
      return;
    }
    router.push(`/groups/${json.id}`);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Group name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Concert"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="cap">Member spending cap (USD)</Label>
        <Input
          id="cap"
          type="number"
          min="1"
          step="0.01"
          value={capDollars}
          onChange={(e) => setCapDollars(e.target.value)}
          required
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Creating…" : "Create group"}
      </Button>
    </form>
  );
}
