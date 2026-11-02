"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePoll } from "@/hooks/usePoll";
import { api } from "@/lib/client/api";
import { ticketColor, type CheckinLogEntry, type EventConfig, type Stats } from "@/lib/types";
import { slotKey } from "@/lib/text";

interface DashboardData {
  stats: Stats;
  recent: CheckinLogEntry[];
  config: EventConfig;
  bevyConfigured: boolean;
}

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** Last 18 ten-minute slots (3 hours), oldest first. */
function recentSlots(bySlot: Record<string, number>) {
  const now = Date.now();
  return Array.from({ length: 18 }, (_, i) => {
    const d = new Date(now - (17 - i) * 10 * 60_000);
    return { label: d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), count: bySlot[slotKey(d)] ?? 0 };
  });
}

export function LiveDashboard() {
  const { data, error } = usePoll(() => api<DashboardData>("/api/dashboard"), 3000);
  if (!data) return <p className="text-muted-foreground">{error ?? "Loading…"}</p>;
  const { stats, recent, config } = data;
  const pct = stats.total ? Math.round((stats.checkedIn / stats.total) * 100) : 0;
  const slots = recentSlots(stats.bySlot);
  const maxSlot = Math.max(1, ...slots.map((s) => s.count));
  const lastHour = slots.slice(-6).reduce((a, s) => a + s.count, 0);
  const types = Object.entries(stats.byType).sort((a, b) => b[1].total - a[1].total);
  const desks = Object.entries(stats.byDesk).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="font-display text-2xl font-bold">{config.eventName} · Live</h1>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {error ? <span className="text-destructive">Reconnecting…</span> : "Updates every 3 seconds"}
        </p>
      </div>

      <section aria-label="Totals" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Checked in", value: stats.checkedIn, sub: `of ${stats.total} registered`, id: "checked-in" },
          { label: "Arrival rate", value: `${pct}%`, sub: `${stats.total - stats.checkedIn} still to arrive`, id: "rate" },
          { label: "Last hour", value: lastHour, sub: "check-ins", id: "last-hour" },
          { label: "Walk-ins", value: stats.walkins, sub: `${stats.badgesPrinted} badges printed`, id: "walkins" },
        ].map((s) => (
          <Card key={s.id}>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <p className="font-display text-4xl font-bold tabular-nums" data-testid={`stat-${s.id}`}>
                {s.value}
              </p>
              <p className="text-xs text-muted-foreground">{s.sub}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <div className="h-3 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Arrival progress">
        <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Arrivals per 10 minutes</CardTitle>
          </CardHeader>
          <CardContent>
            <svg viewBox="0 0 360 150" className="w-full" role="img" aria-label={`Check-ins per 10 minutes over the last 3 hours; ${lastHour} in the last hour`}>
              {slots.map((s, i) => {
                const h = (s.count / maxSlot) * 110;
                return (
                  <g key={i}>
                    <rect x={i * 20 + 3} y={120 - h} width={14} height={Math.max(h, s.count ? 2 : 0)} rx={3} fill="#1a73e8">
                      <title>{`${s.label}: ${s.count}`}</title>
                    </rect>
                    {i % 3 === 0 && (
                      <text x={i === 0 ? 3 : i * 20 + 10} y={140} fontSize={9} textAnchor={i === 0 ? "start" : "middle"} fill="#5f6368">
                        {s.label}
                      </text>
                    )}
                  </g>
                );
              })}
              <line x1={0} x2={360} y1={120.5} y2={120.5} stroke="#dadce0" />
            </svg>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By ticket type</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {types.length === 0 && <p className="text-sm text-muted-foreground">No attendees imported yet.</p>}
            {types.map(([type, t]) => (
              <div key={type}>
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{type}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {t.checkedIn} / {t.total}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full" style={{ width: `${t.total ? (t.checkedIn / t.total) * 100 : 0}%`, background: ticketColor(type) }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">No check-ins yet.</p>
            ) : (
              <ul className="divide-y" data-testid="recent-feed">
                {recent.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 py-2 text-sm">
                    <span className="w-16 shrink-0 tabular-nums text-muted-foreground">{fmtTime(r.at)}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {r.action === "undo" ? <s>{r.name}</s> : r.name}
                      {r.action === "undo" && <span className="ml-1 text-destructive">(undone)</span>}
                    </span>
                    <span className="hidden text-muted-foreground sm:inline">{r.desk}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By desk</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {desks.length === 0 && <p className="text-muted-foreground">—</p>}
            {desks.map(([d, n]) => (
              <div key={d} className="flex justify-between">
                <span>{d}</span>
                <span className="font-semibold tabular-nums">{n}</span>
              </div>
            ))}
            <p className="border-t pt-3 text-xs text-muted-foreground">
              {data.bevyConfigured
                ? config.lastSyncAt
                  ? `Last Bevy sync ${fmtTime(config.lastSyncAt)} · ${config.lastSyncCount} attendees`
                  : "Bevy connected · not synced yet"
                : "Bevy API not configured (using imported/demo data)"}
              {config.lastSyncError && <span className="block text-destructive">Last sync error: {config.lastSyncError}</span>}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
