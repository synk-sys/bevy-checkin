"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Logo } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/hooks/useSession";
import { ApiError, api, getDesk, setDesk } from "@/lib/client/api";
import type { Session } from "@/lib/types";

export function LoginForm() {
  const { session, refresh, loading } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next")?.startsWith("/") ? params.get("next")! : "/";
  const [name, setName] = useState("");
  const [desk, setDeskName] = useState(() => (typeof window === "undefined" ? "Desk 1" : getDesk()));
  const [password, setPassword] = useState("");
  // Volunteers pick their desk after signing in; admins have no desk.
  const [askDesk, setAskDesk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && session) router.replace(next);
  }, [loading, session, router, next]);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ session: Session }>("/api/session", { method: "POST", body: JSON.stringify({ password, name: name.trim() }) });
      if (r.session.role === "admin") await refresh();
      else setAskDesk(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  const chooseDesk = async (e: React.FormEvent) => {
    e.preventDefault();
    setDesk(desk.trim() || "Desk 1");
    await refresh();
  };

  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <Logo />
          <CardTitle className="pt-3">{askDesk ? "Which desk are you at?" : "Start your shift"}</CardTitle>
          <CardDescription>
            {askDesk ? "Shown on the dashboard so you can see which desk is busiest." : "Enter your name and the password your event lead gave you."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {askDesk ? (
            <form onSubmit={chooseDesk} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="desk">Desk name</Label>
                <Input id="desk" required autoFocus maxLength={32} value={desk} onChange={(e) => setDeskName(e.target.value)} />
              </div>
              <Button type="submit" className="w-full">
                Start
              </Button>
            </form>
          ) : (
            <form onSubmit={signIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Your name</Label>
                <Input id="name" autoComplete="username" required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="animate-spin" />} Sign in
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
