import { getService } from "@/lib/server/context";
import { withRole } from "@/lib/server/http";
import type { AttendeeView } from "@/lib/types";

function cell(v: unknown) {
  const s = v == null ? "" : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; // spreadsheet formula injection
  return `"${safe.replace(/"/g, '""')}"`;
}

const COLUMNS: [string, (r: AttendeeView) => unknown][] = [
  ["First Name", (r) => r.firstName],
  ["Last Name", (r) => r.lastName],
  ["Email", (r) => r.email],
  ["Company", (r) => r.company],
  ["Ticket Type", (r) => r.ticketType],
  ["Order Number", (r) => r.orderNumber],
  ["Ticket Number", (r) => r.ticketCode],
  ["Checked In", (r) => (r.checkedIn ? "Yes" : "No")],
  ["Swag Collected", (r) => (r.swagCollectedAt ? "Yes" : "No")],
  ["Desk", (r) => r.desk],
];

/**
 * Attendee list as CSV for spreadsheets: ?status=in (checked in, in arrival
 * order), ?status=out (not arrived) or everyone. Column names match the
 * importer, so an exported file can be imported again.
 */
export const GET = withRole("admin", async (req) => {
  const s = req.nextUrl.searchParams.get("status");
  const rows = await (await getService()).listAll(s === "in" ? { checkedIn: true } : s === "out" ? { checkedIn: false } : {});
  if (s === "in") rows.sort((a, b) => (a.checkedInAt ?? "").localeCompare(b.checkedInAt ?? ""));

  const csv = [COLUMNS.map(([h]) => cell(h)).join(","), ...rows.map((r) => COLUMNS.map(([, get]) => cell(get(r))).join(","))].join("\r\n");
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
