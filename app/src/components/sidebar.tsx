"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { History, LayoutDashboard, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_GROUPS = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/history", label: "History", icon: History },
    ],
  },
];

function initials(name: string) {
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/* `expanded` forces labels visible (mobile drawer); otherwise labels only show
   at lg+, leaving an icon-only rail between md and lg. */
function NavLinks({
  expanded = false,
  onNavigate,
}: {
  expanded?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="flex flex-1 flex-col gap-6">
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <p
            className={cn(
              "px-3 pb-1 text-xs font-medium tracking-wider text-muted-foreground uppercase",
              expanded ? "block" : "hidden lg:block"
            )}
          >
            {group.label}
          </p>
          {group.items.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                title={label}
                className={cn(
                  "flex items-center gap-3 rounded-full px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
                )}
              >
                <Icon size={18} className="shrink-0" />
                <span className={cn(expanded ? "inline" : "hidden lg:inline")}>
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function Logo({ expanded = false }: { expanded?: boolean }) {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 rounded-full px-2">
      <Image
        src="/sunpay-mark.png"
        alt="SunPay"
        width={36}
        height={36}
        className="rounded-[18%]"
      />
      <span
        className={cn(
          "text-lg font-semibold tracking-tight text-foreground",
          expanded ? "inline" : "hidden lg:inline"
        )}
      >
        sunpay
      </span>
    </Link>
  );
}

function UserBlock({
  userName,
  expanded = false,
}: {
  userName: string | null;
  expanded?: boolean;
}) {
  if (!userName) return null;
  return (
    <div className="mt-auto flex items-center gap-3 px-2">
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground"
      >
        {initials(userName)}
      </span>
      <div className={cn("min-w-0", expanded ? "block" : "hidden lg:block")}>
        <p className="truncate text-sm font-medium">{userName}</p>
        <a
          href="/auth/logout"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Sign out
        </a>
      </div>
    </div>
  );
}

/** Persistent rail: full 240px at lg+, icon-only between md and lg, hidden below md. */
export function Sidebar({ userName }: { userName: string | null }) {
  return (
    <aside className="hidden w-16 shrink-0 flex-col gap-8 bg-sidebar px-2 py-6 md:flex lg:w-60 lg:px-4">
      <Logo />
      <NavLinks />
      <UserBlock userName={userName} />
    </aside>
  );
}

/** Below md: menu button in the page header opening an overlay drawer. */
export function MobileNav({ userName }: { userName: string | null }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label="Open navigation"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="flex size-10 items-center justify-center rounded-full text-foreground hover:bg-muted"
      >
        <Menu size={20} />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="flex w-72 max-w-[85vw] flex-col gap-8 bg-background px-4 py-6"
          >
            <div className="flex items-center justify-between">
              <Logo expanded />
              <button
                type="button"
                aria-label="Close navigation"
                autoFocus
                onClick={() => setOpen(false)}
                className="flex size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X size={20} />
              </button>
            </div>
            <NavLinks expanded onNavigate={() => setOpen(false)} />
            <UserBlock userName={userName} expanded />
          </div>
          <button
            type="button"
            aria-label="Close navigation"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="flex-1 bg-black/60"
          />
        </div>
      )}
    </div>
  );
}
