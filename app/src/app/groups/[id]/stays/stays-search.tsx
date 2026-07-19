"use client";

import { useEffect, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface Listing {
  id: string;
  name: string;
  type: string;
  address: string | null;
  thumbnail: string | null;
  stars: number | null;
  guest_rating: number | null;
  total_cents: number;
  per_person_cents: number;
  nights: number;
  provider: string;
  book_url: string | null;
  is_demo?: boolean;
  locked: boolean;
  over_budget_count: number;
}
interface StaysResponse {
  listings: Listing[];
  live: boolean;
  nights: number;
  member_count: number;
}

function fmt(cents: number): string {
  return `$${Math.floor(cents / 100).toLocaleString("en-US")}.${String(cents % 100).padStart(2, "0")}`;
}

export function StaysSearch({ groupId }: { groupId: string }) {
  const [query, setQuery] = useState("Cancun, Mexico");
  const [data, setData] = useState<StaysResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(
    async (address?: string) => {
      setBusy(true);
      setError(null);
      const qs = new URLSearchParams({ groupId });
      if (address) qs.set("address", address);
      try {
        const res = await fetch(`/api/stays?${qs}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "search failed");
        setData(json);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [groupId]
  );

  useEffect(() => {
    search(); // default Cancun search on load
  }, [search]);

  return (
    <div className="space-y-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          search(query);
        }}
      >
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Where to?"
        />
        <Button type="submit" disabled={busy}>
          {busy ? "Searching…" : "Search"}
        </Button>
      </form>

      {data && !data.live && (
        <p className="text-xs text-muted-foreground">
          Offline mode — showing cached Cancun results from fixture.
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        {data?.listings.map((l) => (
          <Card
            key={l.id}
            className={l.locked ? "opacity-50 grayscale" : undefined}
          >
            <CardContent className="space-y-2 p-4">
              {l.thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={l.thumbnail}
                  alt={l.name}
                  className="h-36 w-full rounded-md object-cover"
                />
              )}
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium leading-tight">{l.name}</p>
                {l.stars ? (
                  <span className="whitespace-nowrap text-sm text-amber-500">
                    {"★".repeat(Math.round(l.stars))}
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {l.type}
                {l.guest_rating ? ` · ${l.guest_rating}/10` : ""}
              </p>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-lg font-bold">
                    {fmt(l.per_person_cents)}
                    <span className="text-sm font-normal text-muted-foreground">
                      {" "}
                      / person
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fmt(l.total_cents)} total · {l.nights} nights ·{" "}
                    {data.member_count} people
                  </p>
                </div>
                {l.locked ? (
                  <Badge variant="destructive">
                    Over budget for {l.over_budget_count} member
                    {l.over_budget_count > 1 ? "s" : ""}
                  </Badge>
                ) : (
                  <Badge className="bg-green-600 text-white hover:bg-green-600">
                    In budget ✓
                  </Badge>
                )}
              </div>
              {l.locked ? (
                <Button variant="secondary" className="w-full" disabled>
                  Locked — over a member’s cap
                </Button>
              ) : (
                <Button
                  className="w-full"
                  disabled={!l.book_url}
                  render={
                    <a
                      href={l.book_url ?? "#"}
                      target={l.is_demo ? undefined : "_blank"}
                      rel={l.is_demo ? undefined : "noopener noreferrer"}
                    />
                  }
                >
                  Book on {l.provider} →
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      {data && data.listings.length === 0 && (
        <p className="text-sm text-muted-foreground">No listings found.</p>
      )}
    </div>
  );
}
