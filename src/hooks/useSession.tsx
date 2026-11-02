"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { getClientAuth } from "@/lib/client/firebase";
import { isFirebaseMode } from "@/lib/env";
import type { Session } from "@/lib/types";

interface SessionState {
  loading: boolean;
  mode: "firebase" | "local";
  session: Session | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"firebase" | "local">(isFirebaseMode() ? "firebase" : "local");
  const [session, setSession] = useState<Session | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await api<{ mode: "firebase" | "local"; session: Session | null }>("/api/session");
      setMode(r.mode);
      setSession(r.session);
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    if (isFirebaseMode()) await (await getClientAuth())?.signOut();
    else await api("/api/session", { method: "DELETE" });
    setSession(null);
  }, []);

  useEffect(() => {
    // Data fetching on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return <Ctx.Provider value={{ loading, mode, session, refresh, signOut }}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession must be used inside SessionProvider");
  return v;
}
