import { notFound } from "next/navigation";
import { requireUserPage, isMember } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppShell } from "@/components/app-shell";
import { ExecutionView } from "./execution-view";

export const dynamic = "force-dynamic";

export default async function SplitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUserPage();
  const { id } = await params;
  const split = db
    .prepare("SELECT id, group_id FROM splits WHERE id = ?")
    .get(id) as { id: string; group_id: string } | undefined;
  if (!split || !isMember(split.group_id, user.id)) notFound();

  return (
    <AppShell title="Split" width="2xl">
      <ExecutionView splitId={id} />
    </AppShell>
  );
}
