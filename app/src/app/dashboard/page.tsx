import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth";
import { db } from "@/lib/db";
import { accountBalance } from "@/lib/ledger";
import { fmt } from "@/lib/money";
import { Nav } from "@/components/nav";
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
  pending: "bg-gray-500",
  charged: "bg-green-600",
  floated: "bg-amber-500",
  settled: "bg-blue-600",
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
    <>
      <Nav userName={user.name ?? user.email} />
      <main className="mx-auto max-w-4xl space-y-6 p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <span className="text-sm text-muted-foreground">
            Card on file: {user.card_brand} •••• {user.card_last4}
          </span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>You owe SunPay</CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-4xl font-bold ${outstanding > 0 ? "text-amber-600" : "text-green-600"}`}
            >
              {fmt(outstanding)}
            </p>
            {outstanding === 0 && (
              <p className="mt-1 text-sm text-muted-foreground">All settled ✓</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Your groups</CardTitle>
            <Button size="sm" render={<Link href="/groups/new" />}>
              New group
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {groups.length === 0 && (
              <p className="text-sm text-muted-foreground">No groups yet.</p>
            )}
            {groups.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
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
                  className="flex items-center gap-3 rounded-lg border p-3"
                >
                  <Badge className={`${stateBadge[o.state]} text-white`}>
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
      </main>
    </>
  );
}
