import { notFound, redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmt } from "@/lib/money";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AuthorizeButton } from "./authorize-button";

export const dynamic = "force-dynamic";

interface SplitRow {
  id: string;
  group_id: string;
  merchant_name: string;
  external_order_id: string;
  total_cents: number;
  state: string;
}
interface ShareRow {
  id: string;
  principal_cents: number;
  plan_type: string;
  name: string | null;
  email: string;
  card_brand: string | null;
  card_last4: string | null;
}

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUserPage();
  const { id } = await params;

  const split = db.prepare("SELECT * FROM splits WHERE id = ?").get(id) as
    | SplitRow
    | undefined;
  if (!split) notFound();
  if (split.state !== "draft") redirect(`/split/${id}`);

  const group = db
    .prepare("SELECT organizer_id, name FROM groups WHERE id = ?")
    .get(split.group_id) as { organizer_id: string; name: string };
  if (group.organizer_id !== user.id) notFound();

  const shares = db
    .prepare(
      `SELECT o.id, o.principal_cents, o.plan_type, u.name, u.email, u.card_brand, u.card_last4
       FROM obligations o JOIN users u ON u.id = o.user_id
       WHERE o.split_id = ? ORDER BY o.rowid`
    )
    .all(id) as ShareRow[];
  const minShare = Math.min(...shares.map((s) => s.principal_cents));
  const threshold = Number(process.env.STEP_UP_THRESHOLD_CENTS ?? 50000);
  const needsStepUp =
    split.total_cents > threshold && process.env.AUTH0_SKIP_STEPUP !== "true";

  return (
    <AppShell title={`Review split — ${split.merchant_name}`} width="2xl">
        <Card>
          <CardHeader>
            <CardTitle>
              {fmt(split.total_cents)} across {shares.length} members of “
              {group.name}”
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Card</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shares.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      {s.name ?? s.email}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.card_brand} •••• {s.card_last4}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {s.plan_type === "plan_30" ? "30-day plan" : "charge now"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {fmt(s.principal_cents)}
                      {s.principal_cents > minShare && (
                        <span
                          className="ml-1 text-signal-attention"
                          title="Absorbs the odd cent(s) so shares total exactly"
                        >
                          +{s.principal_cents - minShare}¢
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        {needsStepUp && (
          <p className="text-sm text-muted-foreground">
            This amount is over {fmt(threshold)} — Auth0 will ask for a second
            factor before charging.
          </p>
        )}
        <AuthorizeButton splitId={split.id} totalLabel={fmt(split.total_cents)} />
    </AppShell>
  );
}
