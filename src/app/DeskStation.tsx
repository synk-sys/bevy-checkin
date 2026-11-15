"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Gift, Loader2, Search, UserPlus, Volume2, VolumeX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QrScanner } from "@/components/desk/QrScanner";
import { ResultBanner } from "@/components/desk/ResultBanner";
import { WalkInDialog } from "@/components/desk/WalkInDialog";
import { useSession } from "@/hooks/useSession";
import { ApiError, api } from "@/lib/client/api";
import { printBadge } from "@/lib/client/print";
import { beep, unlockAudioOnFirstTouch } from "@/lib/client/sound";
import { ticketColor, type AttendeeView, type CheckInResult, type EventConfig, type SwagResult } from "@/lib/types";

/** Heuristic: single token with a digit/dash/slash looks like a scanned code, not a name. */
const looksLikeCode = (s: string) => !/\s/.test(s.trim()) && /[\d\-_/:]/.test(s) && s.trim().length >= 4;

export function DeskStation() {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ q: string; list: AttendeeView[] }>({ q: "", list: [] });
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [swagWarning, setSwagWarning] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const [walkIn, setWalkIn] = useState(false);
  const [recent, setRecent] = useState<CheckInResult[]>([]);
  const [sound, setSound] = useState(true);
  const [config, setConfig] = useState<EventConfig | null>(null);
  // Volunteers sign in as their desk, so the session name is the desk.
  const desk = useSession().session?.name ?? "Desk";
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Browser-only values, read after hydration.
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSound(localStorage.getItem("checkin:sound") !== "off");
    } catch {}
    api<{ config: EventConfig }>("/api/dashboard").then((d) => setConfig(d.config)).catch(() => {});
    return unlockAudioOnFirstTouch();
  }, []);

  const trimmed = query.trim();
  const wantSearch = trimmed.length >= 2 && !looksLikeCode(trimmed);
  const results = wantSearch && found.q === trimmed ? found.list : [];
  const searching = wantSearch && found.q !== trimmed;

  const refocus = () => setTimeout(() => inputRef.current?.focus(), 0);

  const show = useCallback(
    (r: CheckInResult) => {
      setResult(r);
      beep(r.status === "checked_in" ? "ok" : r.status === "already" ? "warn" : "error");
      if (r.status !== "not_found") {
        setRecent((list) => [r, ...list.filter((x) => x.status === "not_found" || x.attendee.id !== r.attendee.id)].slice(0, 8));
        if (r.status === "checked_in" && config?.autoPrintBadge) printBadge(r.attendee.id);
      }
    },
    [config?.autoPrintBadge],
  );

  const checkIn = useCallback(
    async (body: { code: string } | { attendeeId: string }): Promise<CheckInResult | null> => {
      setBusy(true);
      setError(null);
      setSwagWarning(null);
      try {
        const r = await api<CheckInResult>("/api/checkin", { method: "POST", body: JSON.stringify(body), allow404: true });
        show(r);
        setQuery("");
        return r;
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Check-in failed");
        beep("error");
        return null;
      } finally {
        setBusy(false);
        refocus();
      }
    },
    [show],
  );

  /** Put an updated attendee back into the result banner and search results. */
  const replaceAttendee = (a: AttendeeView) => {
    setResult((r) => (r && r.status !== "not_found" && r.attendee.id === a.id ? { ...r, attendee: a } : r));
    setFound((f) => ({ ...f, list: f.list.map((x) => (x.id === a.id ? a : x)) }));
  };

  // Swag: one pickup per attendee; a second tap (or another desk) is warned it was already collected.
  const swag = async (id: string, undo = false) => {
    setBusy(true);
    setError(null);
    setSwagWarning(null);
    try {
      if (undo) {
        replaceAttendee((await api<{ attendee: AttendeeView }>(`/api/attendees/${id}/swag`, { method: "DELETE" })).attendee);
      } else {
        const r = await api<SwagResult>(`/api/attendees/${id}/swag`, { method: "POST" });
        replaceAttendee(r.attendee);
        beep(r.status === "collected" ? "ok" : "warn");
        if (r.status === "already") {
          const at = r.attendee.swagCollectedAt ? new Date(r.attendee.swagCollectedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
          setSwagWarning(`${r.attendee.firstName} already collected swag at ${at}${r.attendee.swagDesk ? ` · ${r.attendee.swagDesk}` : ""}.`);
        }
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't record swag");
      beep("error");
    } finally {
      setBusy(false);
      refocus();
    }
  };

  // Camera scan: close the camera once the ticket is found (checked in now or already); keep it open to retry otherwise.
  const scanned = async (code: string) => {
    const status = (await checkIn({ code }))?.status;
    if (status === "checked_in" || status === "already") setCamera(false);
  };

  // Live search as staff type (debounced).
  useEffect(() => {
    if (!wantSearch) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      let list: AttendeeView[] = [];
      try {
        list = (await api<{ results: AttendeeView[] }>(`/api/attendees/search?q=${encodeURIComponent(trimmed)}`)).results;
      } catch {}
      if (!cancelled) setFound({ q: trimmed, list });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [trimmed, wantSearch]);

  // Enter = USB scanner or typed code: check in by code; a single search hit checks in directly.
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q || busy) return;
    if (looksLikeCode(q)) checkIn({ code: q });
    else if (results.length === 1) checkIn({ attendeeId: results[0].id });
  };

  const print = async (id: string) => {
    printBadge(id);
    api(`/api/attendees/${id}/badge`, { method: "POST" }).catch(() => {});
    refocus();
  };

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    try {
      localStorage.setItem("checkin:sound", next ? "on" : "off");
    } catch {}
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <section aria-label="Check in" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="font-display text-2xl font-bold">{config?.eventName ?? "Check-in"}</h1>
            <p className="text-sm text-muted-foreground">{desk}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={toggleSound} aria-pressed={sound} aria-label={sound ? "Mute sounds" : "Unmute sounds"}>
              {sound ? <Volume2 /> : <VolumeX />}
            </Button>
            <Button variant={camera ? "default" : "outline"} onClick={() => setCamera((c) => !c)} aria-pressed={camera} data-testid="camera-toggle">
              {camera ? <CameraOff /> : <Camera />} {camera ? "Stop camera" : "Scan QR"}
            </Button>
          </div>
        </div>

        {camera && <QrScanner onScan={scanned} paused={busy} />}

        <form onSubmit={onSubmit} role="search" className="relative">
          <label htmlFor="scan" className="sr-only">
            Scan ticket or search attendees
          </label>
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            id="scan"
            ref={inputRef}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Scan QR / type ticket code, name or email"
            className="h-16 rounded-2xl pl-12 text-xl"
            data-testid="scan-input"
          />
          {(busy || searching) && <Loader2 className="absolute top-1/2 right-4 size-5 -translate-y-1/2 animate-spin text-primary" aria-label="Working" />}
        </form>

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">
            {error}
          </p>
        )}

        {results.length > 0 && (
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card" aria-label="Search results" data-testid="search-results">
            {results.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 p-3">
                <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: ticketColor(a.ticketType) }} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {a.firstName} {a.lastName}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {a.email || "no email"}
                    {a.company && ` · ${a.company}`} · {a.ticketType}
                  </p>
                </div>
                {a.checkedIn ? (
                  <>
                    <Badge variant="warning">Checked in</Badge>
                    {a.swagCollectedAt ? (
                      <Badge variant="success">
                        <Gift className="size-3" aria-hidden="true" /> Swag collected
                      </Badge>
                    ) : (
                      <Button variant="outline" onClick={() => swag(a.id)} disabled={busy} aria-label={`Swag collected for ${a.firstName} ${a.lastName}`}>
                        <Gift /> Swag
                      </Button>
                    )}
                  </>
                ) : (
                  <Button onClick={() => checkIn({ attendeeId: a.id })} disabled={busy} aria-label={`Check in ${a.firstName} ${a.lastName}`}>
                    Check in
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {wantSearch && !searching && results.length === 0 && (
          <p className="text-muted-foreground">
            No matches.{" "}
            <button type="button" className="font-medium text-primary underline" onClick={() => setWalkIn(true)}>
              Register “{query.trim()}” as a walk-in
            </button>
          </p>
        )}

        {result && (
          <ResultBanner result={result} onPrint={print} onWalkIn={() => setWalkIn(true)} onSwag={(id) => swag(id)} onUndoSwag={(id) => swag(id, true)} busy={busy} />
        )}
        {swagWarning && (
          <p role="alert" className="rounded-xl bg-amber-50 p-3 font-medium text-amber-900" data-testid="swag-warning">
            {swagWarning}
          </p>
        )}

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => setWalkIn(true)}>
            <UserPlus /> Register walk-in
          </Button>
        </div>
      </section>

      <aside aria-label="Recent at this desk" className="space-y-2">
        <h2 className="font-display font-semibold">Recent at this desk</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Check-ins from this desk will appear here.</p>
        ) : (
          <ul className="space-y-2">
            {recent.map((r) =>
              r.status === "not_found" ? null : (
                <li key={r.attendee.id} className="flex items-center gap-2 rounded-xl border bg-card p-2.5 text-sm">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: ticketColor(r.attendee.ticketType) }} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">
                    {r.attendee.firstName} {r.attendee.lastName}
                  </span>
                  <button type="button" onClick={() => print(r.attendee.id)} className="text-primary hover:underline">
                    Badge
                  </button>
                </li>
              ),
            )}
          </ul>
        )}
      </aside>

      <WalkInDialog
        open={walkIn}
        onOpenChange={(o) => {
          setWalkIn(o);
          if (!o) refocus();
        }}
        onDone={show}
        initialName={looksLikeCode(query) ? "" : query}
      />
    </div>
  );
}
