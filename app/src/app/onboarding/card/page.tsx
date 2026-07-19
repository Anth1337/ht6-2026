import { redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { CardSetupForm } from "./card-setup-form";

export const dynamic = "force-dynamic";

export default async function CardOnboarding() {
  const user = await requireUserPage();
  if (user.payment_method_id) redirect("/dashboard");

  return (
    <AppShell title="Save a card" width="md">
      <p className="text-sm text-muted-foreground">
        SunPay charges your share of group purchases to this card. Test
        mode — use 4242 4242 4242 4242, any future expiry, any CVC.
      </p>
      <CardSetupForm />
    </AppShell>
  );
}
