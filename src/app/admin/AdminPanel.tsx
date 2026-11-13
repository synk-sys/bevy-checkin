"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CloudDownload, FileUp, Loader2, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ApiError, api } from "@/lib/client/api";
import type { EventConfig } from "@/lib/types";

export function AdminPanel() {
  const [config, setConfig] = useState<EventConfig | null>(null);
  const [bevyConfigured, setBevyConfigured] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [demoCount, setDemoCount] = useState(240);
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () =>
    api<{ config: EventConfig; bevyConfigured: boolean }>("/api/dashboard").then((d) => {
      setConfig(d.config);
      setBevyConfigured(d.bevyConfigured);
    });

  useEffect(() => {
    load().catch(() => {});
  }, []);

  const run = async (key: string, fn: () => Promise<string>) => {
    setBusy(key);
    setNotice(null);
    try {
      setNotice({ ok: true, text: await fn() });
      await load();
    } catch (e) {
      setNotice({ ok: false, text: e instanceof ApiError ? e.message : "Something went wrong" });
    } finally {
      setBusy(null);
    }
  };

  const patch = (p: Partial<EventConfig>) =>
    run("config", async () => {
      await api("/api/admin/config", { method: "PATCH", body: JSON.stringify(p) });
      return "Settings saved";
    });

  const sync = (body: object, label: string) =>
    run(label, async () => {
      const r = await api<{ created: number; updated: number }>("/api/admin/sync", { method: "POST", body: JSON.stringify(body) });
      return `Imported: ${r.created} new, ${r.updated} updated`;
    });

  const importCsv = () =>
    file &&
    run("csv", async () => {
      const r = await api<{ created: number; updated: number; skipped: number }>("/api/admin/import", {
        method: "POST",
        body: await file.text(),
        headers: { "content-type": "text/csv" },
      });
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      return `Imported: ${r.created} new, ${r.updated} updated${r.skipped ? ` · ${r.skipped} rows skipped (no name, email or ticket)` : ""}`;
    });

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-bold">Admin</h1>
      <p aria-live="polite" className={notice?.ok ? "text-emerald-700" : "text-destructive"}>
        {notice?.text}
      </p>

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Attendee list</CardTitle>
            <CardDescription>
              Export the attendee list from Bevy as a CSV file and upload it here. Upload again whenever new people register: existing people are
              updated, not duplicated, and check-ins made at the desk are kept.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="csvFile">CSV file</Label>
              <Input
                id="csvFile"
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                data-testid="csv-file"
              />
            </div>
            <Button onClick={importCsv} disabled={!file || !!busy} data-testid="import-csv">
              {busy === "csv" ? <Loader2 className="animate-spin" /> : <FileUp />} Import CSV
            </Button>
            {config?.lastSyncAt && (
              <p className="text-sm text-muted-foreground">
                Last import {new Date(config.lastSyncAt).toLocaleString()} · {config.lastSyncCount} attendees
              </p>
            )}
            {config?.lastSyncError && <p className="text-sm text-destructive">Last error: {config.lastSyncError}</p>}
            {bevyConfigured && (
              <Button variant="outline" onClick={() => sync({ source: "bevy" }, "bevy")} disabled={!!busy} data-testid="sync-bevy">
                {busy === "bevy" ? <Loader2 className="animate-spin" /> : <CloudDownload />} Sync from Bevy API
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Desk settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {config && (
              <>
                <form
                  className="flex items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    patch({ eventName: String(new FormData(e.currentTarget).get("eventName") ?? "") });
                  }}
                >
                  <div className="flex-1 space-y-1.5">
                    <Label htmlFor="eventName">Event name (shown on badges)</Label>
                    <Input id="eventName" name="eventName" defaultValue={config.eventName} maxLength={80} required />
                  </div>
                  <Button type="submit" variant="outline">
                    Save
                  </Button>
                </form>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <label htmlFor="autoprint" className="font-medium">
                      Auto-print badge on check-in
                    </label>
                    <p className="text-sm text-muted-foreground">Opens the print dialog right after each successful check-in.</p>
                  </div>
                  <Switch id="autoprint" checked={config.autoPrintBadge} onCheckedChange={(v) => patch({ autoPrintBadge: v })} />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Demo data</CardTitle>
            <CardDescription>Dummy attendees for training volunteers and rehearsing the desk. Disabled in production unless ALLOW_DEMO_DATA=true.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="demoCount">Attendees</Label>
                <Input id="demoCount" type="number" min={1} max={2000} value={demoCount} onChange={(e) => setDemoCount(Number(e.target.value))} className="w-28" />
              </div>
              <Button onClick={() => sync({ source: "demo", count: demoCount }, "demo")} disabled={!!busy} data-testid="load-demo">
                {busy === "demo" && <Loader2 className="animate-spin" />} Load demo attendees
              </Button>
            </div>
            <Button asChild variant="outline">
              <Link href="/admin/tickets">
                <QrCode /> Printable test tickets (QR)
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Maintenance</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() =>
                run("recount", async () => {
                  await api("/api/admin/maintenance", { method: "POST", body: JSON.stringify({ action: "recount" }) });
                  return "Totals recounted";
                })
              }
            >
              Recount totals
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                prompt("Type RESET to delete all attendees and check-ins") === "RESET" &&
                run("reset", async () => {
                  await api("/api/admin/maintenance", { method: "POST", body: JSON.stringify({ action: "reset", confirm: "RESET" }) });
                  return "All attendee data deleted";
                })
              }
            >
              Reset all data
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
