import { notFound } from "next/navigation";
import { requireUserPage } from "@/lib/auth";
import { db } from "@/lib/db";
import { Nav } from "@/components/nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { JoinButton } from "./join-button";

export const dynamic = "force-dynamic";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const user = await requireUserPage();
  const { code } = await params;

  const group = db
    .prepare("SELECT * FROM groups WHERE invite_code = ?")
    .get(code.toUpperCase()) as
    | { id: string; name: string; organizer_id: string }
    | undefined;
  if (!group) notFound();

  const organizer = db
    .prepare("SELECT name, email FROM users WHERE id = ?")
    .get(group.organizer_id) as { name: string | null; email: string };
  // Uniform cap = organizer's cap; an existing invited membership overrides.
  const myMembership = db
    .prepare("SELECT cap_cents, accepted_at FROM memberships WHERE group_id = ? AND user_id = ?")
    .get(group.id, user.id) as { cap_cents: number; accepted_at: number | null } | undefined;
  const orgCap = db
    .prepare("SELECT cap_cents FROM memberships WHERE group_id = ? AND user_id = ?")
    .get(group.id, group.organizer_id) as { cap_cents: number };
  const cap = myMembership?.cap_cents ?? orgCap.cap_cents;

  return (
    <>
      <Nav userName={user.name ?? user.email} />
      <main className="mx-auto max-w-md space-y-6 p-8">
        <Card>
          <CardHeader>
            <CardTitle>Join “{group.name}”</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Invited by {organizer.name ?? organizer.email}.
            </p>
            <div className="rounded-lg border bg-muted/50 p-4 text-sm">
              Set your budget for this group below — you can change it anytime.
              By joining, you authorize SunPay to charge your saved card up to
              that budget per group purchase, automatically, when the organizer
              completes a checkout for this group. If a charge fails, SunPay
              covers your share and you repay within 30 days.
            </div>
            {myMembership?.accepted_at ? (
              <p className="text-sm text-green-700">
                You’re already a member of this group. ✓
              </p>
            ) : (
              <JoinButton code={code} defaultCapCents={cap} />
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
