"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmt } from "@/lib/money";

// Inline "budget" control: each member can adjust their own per-group cap.
// Collapsed → shows the current budget + an Edit button; expanded → a dollar
// input with Save/Cancel. On save it POSTs to /api/groups/[id]/cap and
// router.refresh()es so the server-rendered value updates in place.
export function EditCapForm({
  groupId,
  capCents,
}: {
  groupId: string;
  capCents: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [dollars, setDollars] = useState((capCents / 100).toString());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const cap_cents = Math.round(parseFloat(dollars) * 100);
    const res = await fetch(`/api/groups/${groupId}/cap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cap_cents }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "could not update budget");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  function cancel() {
    setDollars((capCents / 100).toString());
    setError(null);
    setEditing(false);
  }

  if (!editing) {
    return (
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        your budget {fmt(capCents)}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setEditing(true)}
        >
          Edit
        </Button>
      </span>
    );
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <span className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">$</span>
        <Input
          type="number"
          min="1"
          step="0.01"
          value={dollars}
          onChange={(e) => setDollars(e.target.value)}
          className="h-8 w-28"
          autoFocus
        />
        <Button type="button" size="sm" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={cancel}
          disabled={busy}
        >
          Cancel
        </Button>
      </span>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </span>
  );
}
