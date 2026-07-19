"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Obligation {
  id: string;
  principal_cents: number;
  plan_type: string;
  state: "pending" | "charged" | "floated" | "settled";
  name: string | null;
  email: string;
  card_brand: string | null;
  card_last4: string | null;
  last_payment_status: string | null;
}
interface SplitData {
  split: {
    id: string;
    merchant_name: string;
    total_cents: number;
    state: "draft" | "executing" | "settled";
    return_url: string | null;
  };
  obligations: Obligation[];
}

function fmt(cents: number): string {
  return `$${Math.floor(cents / 100).toLocaleString("en-US")}.${String(cents % 100).padStart(2, "0")}`;
}

function StatusBadge({ o }: { o: Obligation }) {
  switch (o.state) {
    case "charged":
    case "settled":
      return <Badge variant="outline" className="border-signal-positive text-signal-positive">charged ✓</Badge>;
    case "floated":
      return (
        <Badge variant="outline" className="border-signal-attention text-signal-attention">
          {o.last_payment_status === "declined" ? "declined → float covers" : "float covers"}
        </Badge>
      );
    default:
      return <Badge variant="secondary">waiting…</Badge>;
  }
}

export function ExecutionView({ splitId }: { splitId: string }) {
  const [data, setData] = useState<SplitData | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    async function poll() {
      try {
        const res = await fetch(`/api/splits/${splitId}`, { cache: "no-store" });
        if (res.ok) {
          const json = (await res.json()) as SplitData;
          if (!stopped) {
            setData(json);
            if (json.split.state === "settled") return; // done — stop polling
          }
        }
      } catch {
        /* transient poll failure — retry */
      }
      if (!stopped) timer = setTimeout(poll, 1000);
    }
    poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [splitId]);

  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const { split, obligations } = data;

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {split.state === "settled" ? "Split settled ✓" : "Charging the group…"}
        </h1>
        <Badge variant="outline">{split.state}</Badge>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>
            {fmt(split.total_cents)} — {split.merchant_name}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {obligations.map((o) => (
            <div key={o.id} className="flex items-center gap-3 rounded-lg border p-3">
              <span className="font-medium">{o.name ?? o.email}</span>
              <span className="text-sm text-muted-foreground">
                {o.card_brand} •••• {o.card_last4}
              </span>
              <span className="ml-auto font-mono text-sm">{fmt(o.principal_cents)}</span>
              <StatusBadge o={o} />
            </div>
          ))}
        </CardContent>
      </Card>
      {split.state === "settled" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Merchant paid in full{" "}
            {obligations.some((o) => o.state === "floated") &&
              "— SunPay’s float covered the difference"}
            .
          </p>
          {split.return_url && (
            <Button size="lg" className="w-full" render={<a href={split.return_url} />}>
              Return to {split.merchant_name}
            </Button>
          )}
        </div>
      )}
    </>
  );
}
