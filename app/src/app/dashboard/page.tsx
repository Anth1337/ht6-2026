import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth";
import { db } from "@/lib/db";
import { accountBalance } from "@/lib/ledger";
import { fmt } from "@/lib/money";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EditCapForm } from "@/components/edit-cap-form";
import { PayNowButton } from "./pay-now-button";

export const dynamic = "force-dynamic";

interface GroupRow {
  id: string;
  name: string;
  invite_code: string;
  organizer_id: string;
  cap_cents: number;
}
interface ObligationRow {
  id: string;
  principal_cents: number;
  paid_cents: number;
  state: string;
  due_date: number | null;
  merchant_name: string;
  split_state: string;
}

const stateBadge: Record<string, string> = {
  pending: "border border-muted-foreground/40 text-muted-foreground bg-transparent",
  charged: "border border-signal-positive text-signal-positive bg-transparent",
  floated: "border border-signal-attention text-signal-attention bg-transparent",
  settled: "border border-signal-positive text-signal-positive bg-transparent",
};

export default async function Dashboard() {
  const user = await requireUserPage();
  if (!user.payment_method_id) redirect("/onboarding/card");

  const outstanding = accountBalance(`member_receivable:${user.id}`);
  const groups = db
    .prepare(
      `SELECT g.id, g.name, g.invite_code, g.organizer_id, m.cap_cents
       FROM memberships m JOIN groups g ON g.id = m.group_id
       WHERE m.user_id = ? AND m.accepted_at IS NOT NULL
       ORDER BY g.created_at DESC`
    )
    .all(user.id) as GroupRow[];
  const obligations = db
    .prepare(
      `SELECT o.id, o.principal_cents, o.paid_cents, o.state, o.due_date,
              s.merchant_name, s.state AS split_state
       FROM obligations o JOIN splits s ON s.id = o.split_id
       WHERE o.user_id = ? ORDER BY s.created_at DESC LIMIT 10`
    )
    .all(user.id) as ObligationRow[];

  return (
    <AppShell
      title="Dashboard"
      action={
        <Button render={<Link href="/groups/new" />}>New group</Button>
      }
    >
        <Card>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">You owe SunPay</p>
            <p
              className={`text-5xl font-semibold tracking-tight ${outstanding > 0 ? "text-signal-attention" : "text-signal-positive"}`}
            >
              {fmt(outstanding)}
            </p>
            <p className="text-sm text-muted-foreground">
              {outstanding === 0 && <>All settled ✓ · </>}
              Card on file: {user.card_brand} •••• {user.card_last4}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your groups</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {groups.length === 0 && (
              <p className="text-sm text-muted-foreground">No groups yet.</p>
            )}
            {groups.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-background px-4 py-3"
              >
                <Link
                  href={`/groups/${g.id}`}
                  className="font-medium hover:underline"
                >
                  {g.name}
                  {g.organizer_id === user.id && (
                    <span className="text-sm font-normal text-muted-foreground">
                      {" "}
                      · organizer
                    </span>
                  )}
                </Link>
                <EditCapForm groupId={g.id} capCents={g.cap_cents} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent obligations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {obligations.length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing yet.</p>
            )}
            {obligations.map((o) => {
              const remaining = o.principal_cents - o.paid_cents;
              return (
                <div
                  key={o.id}
                  className="flex items-center gap-3 rounded-xl bg-background px-4 py-3"
                >
                  <Badge variant="outline" className={stateBadge[o.state]}>
                    {o.state}
                  </Badge>
                  <span className="font-medium">{o.merchant_name}</span>
                  <span className="text-sm text-muted-foreground">
                    {fmt(o.principal_cents)}
                    {o.state === "floated" && o.due_date
                      ? ` · due ${new Date(o.due_date).toLocaleDateString()}`
                      : ""}
                  </span>
                  {o.state === "floated" && remaining > 0 && (
                    <span className="ml-auto">
                      <PayNowButton obligationId={o.id} amountLabel={fmt(remaining)} />
                    </span>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
    </AppShell>
  );
}
