import Link from "next/link";
import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import { Button } from "@/components/ui/button";

export default async function Landing() {
  const session = await auth0.getSession();
  if (session) redirect("/dashboard");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-5xl font-bold tracking-tight">
        Sun<span className="text-amber-500">Pay</span>
      </h1>
      <p className="max-w-md text-center text-muted-foreground">
        Klarna splits your payment across time. SunPay splits it across people
        — and the merchant gets paid in full either way.
      </p>
      <Button size="lg" render={<Link href="/auth/login" />}>
        Sign in
      </Button>
    </main>
  );
}
