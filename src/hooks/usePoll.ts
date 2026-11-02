"use client";

import { useEffect, useRef, useState } from "react";

/** Poll a loader while the tab is visible, backing off on errors. */
export function usePoll<T>(load: () => Promise<T>, intervalMs: number, enabled = true) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    const tick = async () => {
      if (document.visibilityState !== "hidden") {
        try {
          const d = await loadRef.current();
          if (!cancelled) {
            setData(d);
            setError(null);
            failures = 0;
          }
        } catch (e) {
          failures++;
          if (!cancelled) setError((e as Error).message);
        }
      }
      if (!cancelled) timer = setTimeout(tick, Math.min(intervalMs * 2 ** failures, 30_000));
    };
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [intervalMs, enabled]);

  return { data, error, setData };
}
