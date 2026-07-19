import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserPage } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmt } from "@/lib/money";
import { Nav } from "@/components/nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EditCapForm } from "@/components/edit-cap-form";
import { InviteLink } from "./invite-link";

export const dynamic = "force-dynamic";

interface MemberRow {
  id: string;
  name: string | null;
  email: string;
  cap_cents: number;
  accepted_at: number | null;
}

export default async function GroupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUserPage();
  const { id } = await params;

  const group = db.prepare("SELECT * FROM groups WHERE id = ?").get(id) as
    | { id: string; name: string; invite_code: string; organizer_id: string }
    | undefined;
  if (!group) notFound();
  const membership = db
    .prepare("SELECT 1 FROM memberships WHERE group_id = ? AND user_id = ?")
    .get(id, user.id);
  if (!membership) notFound();

  const roster = db
    .prepare(
      `SELECT u.id, u.name, u.email, m.cap_cents, m.accepted_at
       FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.group_id = ? ORDER BY (u.id = ?) DESC, m.accepted_at, m.rowid`
    )
    .all(id, group.organizer_id) as MemberRow[];
  const allAccepted = roster.every((r) => r.accepted_at !== null);

  return (
    <>
      <Nav userName={user.name ?? user.email} />
      <main className="mx-auto max-w-4xl space-y-6 p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">{group.name}</h1>
          {allAccepted ? (
            <Button render={<Link href={`/groups/${group.id}/stays`} />}>
              Find a stay
            </Button>
          ) : (
            <Button disabled variant="secondary" title="Waiting for all invites to be accepted">
              Find a stay (waiting on invites)
            </Button>
          )}
        </div>

        <InviteLink code={group.invite_code} />

        <Card>
          <CardHeader>
            <CardTitle>Roster</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {roster.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-3 rounded-lg border p-3"
              >
                <span className="font-medium">{m.name ?? m.email}</span>
                {m.id === group.organizer_id && (
                  <Badge variant="outline">organizer</Badge>
                )}
                <span className="ml-auto">
                  {m.id === user.id ? (
                    <EditCapForm groupId={group.id} capCents={m.cap_cents} />
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      cap {fmt(m.cap_cents)}
                    </span>
                  )}
                </span>
                {m.accepted_at ? (
                  <Badge className="bg-green-600 text-white hover:bg-green-600">
                    accepted
                  </Badge>
                ) : (
                  <Badge variant="secondary">invited</Badge>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
