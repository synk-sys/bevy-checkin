"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/useSession";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Desk", admin: false },
  { href: "/dashboard", label: "Dashboard", admin: false },
  { href: "/attendees", label: "Attendees", admin: true },
  { href: "/admin", label: "Admin", admin: true },
];

export function Logo() {
  return (
    <span className="flex items-center gap-2 font-display text-lg font-bold">
      <span className="grid grid-cols-2 gap-0.5" aria-hidden="true">
        {["#4285F4", "#EA4335", "#FBBC04", "#34A853"].map((c) => (
          <span key={c} className="size-2.5 rounded-[3px]" style={{ background: c }} />
        ))}
      </span>
      Check-in Desk
    </span>
  );
}

/** Signed-in chrome. Redirects to /login when there's no staff session. */
export function AppShell({ children, admin = false }: { children: React.ReactNode; admin?: boolean }) {
  const { loading, session, signOut } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, session, router, pathname]);

  if (loading || !session) {
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
          <Link href="/" aria-label="Check-in desk home">
            <Logo />
          </Link>
          <nav aria-label="Main" className="order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
            {NAV.filter((n) => !n.admin || session.role === "admin").map((n) => (
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
              {session.name} · {session.role === "admin" ? "Admin" : "Staff"}
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
