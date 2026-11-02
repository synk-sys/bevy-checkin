"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Printer, RefreshCw, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, downloadAuthed } from "@/lib/client/api";
import { printBadge } from "@/lib/client/print";
import { searchKey } from "@/lib/text";
import { ticketColor, type AttendeeView } from "@/lib/types";
import { cn } from "@/lib/utils";

type Filter = "all" | "in" | "out";

export function AttendeeTable() {
  const [rows, setRows] = useState<AttendeeView[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await api<{ attendees: AttendeeView[] }>(`/api/admin/attendees${filter === "all" ? "" : `?status=${filter}`}`)).attendees);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    // Data fetching when the filter changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const visible = useMemo(() => {
    const k = searchKey(q);
    if (!k) return rows;
    return rows.filter((r) => searchKey(`${r.firstName} ${r.lastName} ${r.email} ${r.company} ${r.ticketCode}`).includes(k));
  }, [rows, q]);

  const undo = async (a: AttendeeView) => {
    if (!confirm(`Undo check-in for ${a.firstName} ${a.lastName}?`)) return;
    await api(`/api/attendees/${a.id}`, { method: "PATCH", body: JSON.stringify({ action: "undo" }) });
    setNotice(`Check-in undone for ${a.firstName} ${a.lastName}`);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">Attendees</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => downloadAuthed(`/api/admin/export?status=${filter}`, `attendees-${filter}.csv`)}>
            <Download /> Export CSV
          </Button>
          <Button variant="ghost" size="sm" onClick={load} aria-label="Refresh">
            <RefreshCw className={cn(loading && "animate-spin")} />
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Filter" className="flex rounded-full bg-muted p-1">
          {(["all", "in", "out"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cn("rounded-full px-3 py-1.5 text-sm font-medium", filter === f ? "bg-card shadow-sm" : "text-muted-foreground")}
            >
              {f === "all" ? "All" : f === "in" ? "Checked in" : "Not yet"}
            </button>
          ))}
        </div>
        <label htmlFor="filter-q" className="sr-only">
          Filter attendees
        </label>
        <Input id="filter-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name, email, company, code" className="max-w-xs" />
        <span className="text-sm text-muted-foreground">{visible.length} shown</span>
      </div>
      <p aria-live="polite" className="min-h-5 text-sm text-emerald-700">
        {notice}
      </p>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-muted-foreground">
            <tr>
              <th className="p-3 font-medium">Name</th>
              <th className="p-3 font-medium">Ticket</th>
              <th className="hidden p-3 font-medium md:table-cell">Email</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {visible.slice(0, 500).map((a) => (
              <tr key={a.id}>
                <td className="p-3">
                  <p className="font-medium">
                    {a.firstName} {a.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">{a.company}</p>
                </td>
                <td className="p-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full" style={{ background: ticketColor(a.ticketType) }} aria-hidden="true" />
                    {a.ticketType}
                  </span>
                  <p className="font-mono text-xs text-muted-foreground">{a.ticketCode}</p>
                </td>
                <td className="hidden p-3 md:table-cell">{a.email}</td>
                <td className="p-3">
                  {a.checkedIn ? (
                    <Badge variant="success">
                      {new Date(a.checkedInAt!).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · {a.desk}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Not yet</Badge>
                  )}
                </td>
                <td className="p-3 text-right whitespace-nowrap">
                  <Button variant="ghost" size="sm" onClick={() => printBadge(a.id)} aria-label={`Print badge for ${a.firstName}`}>
                    <Printer />
                  </Button>
                  {a.checkedIn && (
                    <Button variant="ghost" size="sm" onClick={() => undo(a)} aria-label={`Undo check-in for ${a.firstName}`}>
                      <Undo2 />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length > 500 && <p className="p-3 text-center text-sm text-muted-foreground">Showing first 500 — refine the filter.</p>}
        {!loading && visible.length === 0 && <p className="p-6 text-center text-muted-foreground">No attendees. Import from Bevy or load demo data on the Admin page.</p>}
      </div>
    </div>
  );
}
