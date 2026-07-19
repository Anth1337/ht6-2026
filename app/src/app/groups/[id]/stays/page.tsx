import { notFound } from "next/navigation";
import { requireUserPage, isMember } from "@/lib/auth";
import { db } from "@/lib/db";
import { Nav } from "@/components/nav";
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
    <>
      <Nav userName={user.name ?? user.email} />
      <main className="mx-auto max-w-4xl space-y-6 p-8">
        <div>
          <h1 className="text-3xl font-bold">Find a stay — {group.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Budget research only — prices are split per person and checked
            against each member’s cap. Nothing here creates a payment.
          </p>
        </div>
        <StaysSearch groupId={group.id} />
      </main>
    </>
  );
}
