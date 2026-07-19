import { requireUserPage } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { NewGroupForm } from "./new-group-form";

export default async function NewGroup() {
  await requireUserPage();
  return (
    <AppShell title="Create a group" width="md">
      <p className="text-sm text-muted-foreground">
        Every member authorizes charges up to the spending cap when they
        accept the invite.
      </p>
      <NewGroupForm />
    </AppShell>
  );
}
