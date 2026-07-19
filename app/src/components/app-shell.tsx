import type { ReactNode } from "react";
import { currentUser } from "@/lib/auth";
import { MobileNav, Sidebar } from "@/components/sidebar";
import { cn } from "@/lib/utils";

const WIDTHS = {
  md: "max-w-md",
  "2xl": "max-w-2xl",
  "4xl": "max-w-4xl",
} as const;

/**
 * Signed-in layout shell: persistent left sidebar, sticky page header
 * (title + optional primary action), independently scrolling content column.
 * Resolves the user itself so pages don't have to thread `userName` through.
 */
export async function AppShell({
  title,
  action,
  width = "4xl",
  children,
}: {
  title: string;
  action?: ReactNode;
  width?: keyof typeof WIDTHS;
  children: ReactNode;
}) {
  const user = await currentUser();
  const userName = user ? (user.name ?? user.email) : null;
  return (
    <div className="flex h-svh">
      <Sidebar userName={userName} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="z-10 bg-background px-6 pt-6 pb-4 sm:px-10">
          <div
            className={cn("mx-auto flex w-full items-center gap-3", WIDTHS[width])}
          >
            <MobileNav userName={userName} />
            <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">
              {title}
            </h1>
            {action && <div className="ml-auto shrink-0">{action}</div>}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto px-6 pt-2 pb-16 sm:px-10">
          <div className={cn("mx-auto w-full space-y-6", WIDTHS[width])}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
