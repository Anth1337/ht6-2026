import { notFound } from "next/navigation";
import { requireUserPage, isMember } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppShell } from "@/components/app-shell";
import { StaysSearch } from "./stays-search";

export const dynamic = "force-dynamic";

export default async function StaysPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUserPage();
  const { id } = await params;
  const group = db
    .prepare("SELECT id, name FROM groups WHERE id = ?")
    .get(id) as { id: string; name: string } | undefined;
  if (!group || !isMember(id, user.id)) notFound();

  return (
    <AppShell title={`Find a stay — ${group.name}`}>
      <p className="text-sm text-muted-foreground">
        Budget research only — prices are split per person and checked
        against each member’s cap. Nothing here creates a payment.
      </p>
      <StaysSearch groupId={group.id} />
    </AppShell>
  );
}
