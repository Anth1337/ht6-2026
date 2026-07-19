import { requireUserPage } from "@/lib/auth";
import { db } from "@/lib/db";
import { verifyParams } from "@/lib/sign";
import { allocate } from "@/lib/allocate";
import { fmt } from "@/lib/money";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GroupPicker } from "./group-picker";

export const dynamic = "force-dynamic";

interface GroupRow {
  id: string;
  name: string;
}

export default async function SplitEntry({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUserPage();
  const sp = await searchParams;
  const merchant_name = sp.merchant_name ?? "";
  const external_order_id = sp.external_order_id ?? "";
  const amount_cents = Number(sp.amount_cents ?? 0);
  const return_url = sp.return_url ?? "";
  const sig = sp.sig ?? "";

  // §7.3 — reject tampered handoffs before showing anything.
  const valid =
    !!sig &&
    verifyParams({ merchant_name, external_order_id, amount_cents, return_url }, sig);
  if (!valid) {
    return (
      <AppShell title="Split checkout" width="md">
        <Card>
          <CardHeader>
            <CardTitle className="text-red-600">Invalid handoff</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            This checkout link has a bad or missing signature. Go back to the
            merchant and try again.
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  // Eligible groups: user organizes them, every invite accepted, every member
  // has a saved card and a cap covering their share.
  const groups = db
    .prepare("SELECT id, name FROM groups WHERE organizer_id = ?")
    .all(user.id) as GroupRow[];
  const evaluated = groups.map((g) => {
    const members = db
      .prepare(
        `SELECT m.cap_cents, m.accepted_at, u.payment_method_id, u.name, u.email
         FROM memberships m JOIN users u ON u.id = m.user_id
         WHERE m.group_id = ?`
      )
      .all(g.id) as {
      cap_cents: number;
      accepted_at: number | null;
      payment_method_id: string | null;
      name: string | null;
      email: string;
    }[];
    const accepted = members.filter((m) => m.accepted_at !== null);
    let reason: string | null = null;
    if (accepted.length < members.length) reason = "invites still pending";
    else if (accepted.some((m) => !m.payment_method_id)) reason = "a member has no saved card";
    else {
      const shares = allocate(amount_cents, accepted.length);
      // conservative: compare the largest share against the smallest cap
      const maxShare = Math.max(...shares);
      const overCap = accepted.some((m) => maxShare > m.cap_cents);
      if (overCap) reason = "share exceeds a member's cap";
    }
    return { ...g, member_count: accepted.length, reason };
  });

  return (
    <AppShell title="Split checkout" width="md">
      <Card>
        <CardHeader>
          <CardTitle>
            Split {fmt(amount_cents)} from {merchant_name}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Order {external_order_id} · signature verified ✓
        </CardContent>
      </Card>
      <GroupPicker
        groups={evaluated}
        handoff={{ merchant_name, external_order_id, amount_cents, return_url, sig }}
      />
    </AppShell>
  );
}
