import { redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { CardSetupForm } from "./card-setup-form";

export const dynamic = "force-dynamic";

export default async function CardOnboarding() {
  const user = await requireUserPage();
  if (user.payment_method_id) redirect("/dashboard");

  return (
    <>
      <Nav userName={user.name ?? user.email} />
      <main className="mx-auto max-w-md space-y-6 p-8">
        <div>
          <h1 className="text-2xl font-bold">Save a card</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            SunPay charges your share of group purchases to this card. Test
            mode — use 4242 4242 4242 4242, any future expiry, any CVC.
          </p>
        </div>
        <CardSetupForm />
      </main>
    </>
  );
}
