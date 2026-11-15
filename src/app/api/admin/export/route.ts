import { getService } from "@/lib/server/context";
import { withRole } from "@/lib/server/http";
import type { AttendeeView } from "@/lib/types";

function cell(v: unknown) {
  const s = v == null ? "" : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; // spreadsheet formula injection
  return `"${safe.replace(/"/g, '""')}"`;
}

/** "2026-11-15 09:42" in the admin's own time zone (sent by the browser), UTC otherwise. */
function timeFormatter(tz: string | null) {
  let zone = "UTC";
  if (tz) {
    try {
      new Intl.DateTimeFormat("en-CA", { timeZone: tz });
      zone = tz;
    } catch {}
  }
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return { zone, format: (iso: string | null) => (iso ? f.format(new Date(iso)).replace(",", "") : "") };
}

/**
 * Attendee list as CSV for spreadsheets: ?status=in (checked in, in arrival
 * order), ?status=out (not arrived) or everyone. Column names match the
 * importer, so an exported file can be imported again.
 */
export const GET = withRole("admin", async (req) => {
  const s = req.nextUrl.searchParams.get("status");
  const time = timeFormatter(req.nextUrl.searchParams.get("tz"));
  const rows = await (await getService()).listAll(s === "in" ? { checkedIn: true } : s === "out" ? { checkedIn: false } : {});
  if (s === "in") rows.sort((a, b) => (a.checkedInAt ?? "").localeCompare(b.checkedInAt ?? ""));

  const columns: [string, (r: AttendeeView) => unknown][] = [
    ["First Name", (r) => r.firstName],
    ["Last Name", (r) => r.lastName],
    ["Email", (r) => r.email],
    ["Company", (r) => r.company],
    ["Ticket Type", (r) => r.ticketType],
    ["Ticket Number", (r) => r.ticketCode],
    ["Checked In", (r) => (r.checkedIn ? "Yes" : "No")],
    [`Checked In At (${time.zone})`, (r) => time.format(r.checkedInAt)],
    ["Desk", (r) => r.desk],
    ["Checked In By", (r) => r.checkedInBy],
    ["Walk-in", (r) => (r.source === "walkin" ? "Yes" : "No")],
    ["Badge Printed", (r) => (r.badgePrintedAt ? "Yes" : "No")],
  ];
  const csv = [columns.map(([h]) => cell(h)).join(","), ...rows.map((r) => columns.map(([, get]) => cell(get(r))).join(","))].join("\r\n");
  const label = s === "in" ? "checked-in" : s === "out" ? "not-arrived" : "all";
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  return new Response("﻿" + csv + "\r\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="attendees-${label}-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
});
