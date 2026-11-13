import { csvRecords } from "@/lib/csv";
import { normalizeBevyAttendee, type NormalizedAttendee } from "@/lib/server/bevy";
import { getService } from "@/lib/server/context";
import { errorResponse, json, withRole } from "@/lib/server/http";

// Stays under Vercel's 4.5 MB request limit; tens of thousands of attendees fit.
const MAX_BYTES = 4_000_000;
const MAX_ROWS = 20_000;

/**
 * Import attendees from a CSV export (Bevy's attendee export, or any sheet
 * with name/email/ticket columns). The body is the raw CSV text. Importing
 * the same list again updates people instead of duplicating them, and
 * check-ins already made at the desk are kept.
 */
export const POST = withRole("admin", async (req, session) => {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES) return errorResponse(413, "INVALID", "File is too large (4 MB max)");
  const text = await req.text();
  if (text.length > MAX_BYTES) return errorResponse(413, "INVALID", "File is too large (4 MB max)");

  const { headers, records } = csvRecords(text);
  if (!records.length) return errorResponse(400, "INVALID", "The file has no attendee rows. Upload a CSV with a header row.");
  if (records.length > MAX_ROWS) return errorResponse(400, "INVALID", `Too many rows (${records.length}). The limit is ${MAX_ROWS}.`);

  // One entry per attendee: a later row for the same person replaces an earlier one.
  const byId = new Map<string, NormalizedAttendee>();
  let skipped = 0;
  for (const r of records) {
    // Lists without an ID or ticket column still import, keyed by email (found at the desk by name search).
    const a = normalizeBevyAttendee(r) ?? (r.email ? normalizeBevyAttendee({ ...r, id: r.email }) : null);
    if (a) byId.set(a.bevyId, a);
    else skipped++;
  }
  if (!byId.size)
    return errorResponse(
      400,
      "INVALID",
      `Couldn't find attendee name, email and ticket columns. Columns in this file: ${headers.slice(0, 15).join(", ") || "none"}`,
    );

  const service = await getService();
  const list = [...byId.values()];
  const res = await service.upsertAttendees(list, "bevy");
  await service.updateConfig({ lastSyncAt: new Date().toISOString(), lastSyncCount: list.length, lastSyncError: null });
  console.info("[checkin] csv import", { by: session.name, rows: records.length, skipped, ...res });
  return json({ ...res, skipped, rows: records.length });
});
