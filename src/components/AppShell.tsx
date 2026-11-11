"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/useSession";
import { cn } from "@/lib/utils";

type Audience = "everyone" | "staff" | "admin";

// Admins don't scan tickets, so the Desk is for volunteers only.
const NAV: { href: string; label: string; for: Audience }[] = [
  { href: "/", label: "Desk", for: "staff" },
  { href: "/dashboard", label: "Dashboard", for: "everyone" },
  { href: "/attendees", label: "Attendees", for: "admin" },
  { href: "/admin", label: "Admin", for: "admin" },
];

export function Logo({ label = "Check-in Desk" }: { label?: string }) {
  return (
    <span className="flex items-center gap-2 font-display text-lg font-bold">
      <span className="grid grid-cols-2 gap-0.5" aria-hidden="true">
        {["#4285F4", "#EA4335", "#FBBC04", "#34A853"].map((c) => (
          <span key={c} className="size-2.5 rounded-[3px]" style={{ background: c }} />
        ))}
      </span>
      {label}
    </span>
  );
}

/**
 * Signed-in chrome. Redirects to the sign-in page when there's no session,
 * and admins away from volunteer-only pages (the Desk) to the Admin page.
 */
export function AppShell({ children, admin = false, staffOnly = false }: { children: React.ReactNode; admin?: boolean; staffOnly?: boolean }) {
  const { loading, session, signOut } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const isAdmin = session?.role === "admin";
  const adminElsewhere = staffOnly && isAdmin;

  useEffect(() => {
    if (!loading && !session) router.replace(`${admin ? "/admin/login" : "/login"}?next=${encodeURIComponent(pathname)}`);
    else if (adminElsewhere) router.replace("/admin");
  }, [loading, session, router, pathname, admin, adminElsewhere]);

  if (loading || !session || adminElsewhere) {
    return (
      <div className="grid h-dvh place-items-center">
        <Loader2 className="size-8 animate-spin text-primary" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="no-print sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <Link href={isAdmin ? "/admin" : "/"} aria-label={isAdmin ? "Admin home" : "Check-in desk home"}>
            <Logo />
          </Link>
          <nav aria-label="Main" className="order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
            {NAV.filter((n) => n.for === "everyone" || n.for === (isAdmin ? "admin" : "staff")).map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={pathname === n.href ? "page" : undefined}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap",
                  pathname === n.href ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className="hidden text-muted-foreground sm:inline">
              {session.name} · {isAdmin ? "Admin" : "Staff"}
            </span>
            <Button variant="ghost" size="sm" onClick={() => signOut().then(() => router.replace("/login"))}>
              <LogOut /> Sign out
            </Button>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-5">
        {admin && session.role !== "admin" ? (
          <p className="rounded-xl border bg-card p-6 text-center text-muted-foreground">This page is for admins only.</p>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
