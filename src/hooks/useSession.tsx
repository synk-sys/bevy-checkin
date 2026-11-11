"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import type { Session } from "@/lib/types";

interface SessionState {
  loading: boolean;
  session: Session | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await api<{ session: Session | null }>("/api/session");
      setSession(r.session);
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await api("/api/session", { method: "DELETE" });
    setSession(null);
  }, []);

  useEffect(() => {
    // Data fetching on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return <Ctx.Provider value={{ loading, session, refresh, signOut }}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession must be used inside SessionProvider");
  return v;
}
