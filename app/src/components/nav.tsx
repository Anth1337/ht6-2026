import Link from "next/link";

export function Nav({ userName }: { userName?: string | null }) {
  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-4xl items-center gap-6 px-8 py-4">
        <Link href="/dashboard" className="text-xl font-bold">
          Sun<span className="text-amber-500">Pay</span>
        </Link>
        <nav className="flex gap-4 text-sm text-muted-foreground">
          <Link href="/dashboard" className="hover:text-foreground">
            Dashboard
          </Link>
          <Link href="/ledger" className="hover:text-foreground">
            Ledger
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          {userName && <span className="text-muted-foreground">{userName}</span>}
          <a href="/auth/logout" className="underline-offset-4 hover:underline">
            Sign out
          </a>
        </div>
      </div>
    </header>
  );
}
