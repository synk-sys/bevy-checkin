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
import { getClientAuth } from "@/lib/client/firebase";

export function LoginForm() {
  const { mode, session, refresh, loading } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next")?.startsWith("/") ? params.get("next")! : "/";
  const [name, setName] = useState("");
  const [desk, setDeskName] = useState(() => (typeof window === "undefined" ? "Desk 1" : getDesk()));
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && session) router.replace(next);
  }, [loading, session, router, next]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDesk(desk.trim() || "Desk 1");
    try {
      if (mode === "firebase") {
        const auth = await getClientAuth();
        const { GoogleAuthProvider, signInWithPopup } = await import("firebase/auth");
        await signInWithPopup(auth!, new GoogleAuthProvider());
      } else {
        await api("/api/session", { method: "POST", body: JSON.stringify({ passcode, name: name.trim() }) });
      }
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <Logo />
          <CardTitle className="pt-3">Start your shift</CardTitle>
          <CardDescription>
            {mode === "firebase" ? "Sign in with your organizer Google account." : "Enter your name and the volunteer passcode."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            {mode === "local" && (
              <div className="space-y-2">
                <Label htmlFor="name">Your name</Label>
                <Input id="name" autoComplete="name" required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="desk">Desk name</Label>
              <Input id="desk" required maxLength={32} value={desk} onChange={(e) => setDeskName(e.target.value)} />
              <p className="text-xs text-muted-foreground">Shown on the dashboard so you can see which desk is busiest.</p>
            </div>
            {mode === "local" && (
              <div className="space-y-2">
                <Label htmlFor="passcode">Passcode</Label>
                <Input id="passcode" type="password" required autoComplete="current-password" value={passcode} onChange={(e) => setPasscode(e.target.value)} />
              </div>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} {mode === "firebase" ? "Sign in with Google" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
