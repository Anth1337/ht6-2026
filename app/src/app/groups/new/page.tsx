import { requireUserPage } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { NewGroupForm } from "./new-group-form";

export default async function NewGroup() {
  const user = await requireUserPage();
  return (
    <>
      <Nav userName={user.name ?? user.email} />
      <main className="mx-auto max-w-md space-y-6 p-8">
        <div>
          <h1 className="text-2xl font-bold">Create a group</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every member authorizes charges up to the spending cap when they
            accept the invite.
          </p>
        </div>
        <NewGroupForm />
      </main>
    </>
  );
}
