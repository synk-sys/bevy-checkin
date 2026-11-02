import { getService } from "@/lib/server/context";
import { withRole } from "@/lib/server/http";

function cell(v: unknown) {
  const s = v == null ? "" : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; // spreadsheet formula injection
  return `"${safe.replace(/"/g, '""')}"`;
}

export const GET = withRole("admin", async (req) => {
  const s = req.nextUrl.searchParams.get("status");
  const rows = await (await getService()).listAll(s === "in" ? { checkedIn: true } : s === "out" ? { checkedIn: false } : {});
  const header = ["firstName", "lastName", "email", "company", "ticketType", "ticketCode", "source", "checkedIn", "checkedInAt", "desk", "checkedInBy", "badgePrintedAt"] as const;
  const csv = [header.join(","), ...rows.map((r) => header.map((h) => cell(r[h])).join(","))].join("\n");
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  return new Response("﻿" + csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="checkin-${s ?? "all"}-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
});
