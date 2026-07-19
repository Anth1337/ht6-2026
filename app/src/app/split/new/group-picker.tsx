"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface EvaluatedGroup {
  id: string;
  name: string;
  member_count: number;
  reason: string | null;
}

export function GroupPicker({
  groups,
  handoff,
}: {
  groups: EvaluatedGroup[];
  handoff: {
    merchant_name: string;
    external_order_id: string;
    amount_cents: number;
    return_url: string;
    sig: string;
  };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(groupId: string) {
    setBusy(groupId);
    setError(null);
    const res = await fetch("/api/splits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...handoff, group_id: groupId }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "could not create split");
      setBusy(null);
      return;
    }
    router.push(
      json.state === "draft" ? `/split/${json.id}/review` : `/split/${json.id}`
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pick a group</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {groups.length === 0 && (
          <p className="text-sm text-muted-foreground">
            You don’t organize any groups yet.
          </p>
        )}
        {groups.map((g) => (
          <div
            key={g.id}
            className={`flex items-center justify-between rounded-lg border p-3 ${g.reason ? "opacity-50" : ""}`}
          >
            <div>
              <p className="font-medium">{g.name}</p>
              <p className="text-xs text-muted-foreground">
                {g.member_count} members{g.reason ? ` · ${g.reason}` : ""}
              </p>
            </div>
            <Button
              size="sm"
              disabled={!!g.reason || busy !== null}
              onClick={() => pick(g.id)}
            >
              {busy === g.id ? "Creating…" : "Select"}
            </Button>
          </div>
        ))}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </CardContent>
    </Card>
  );
}
