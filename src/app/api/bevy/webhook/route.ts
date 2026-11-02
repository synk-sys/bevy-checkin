import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { extractRecords, normalizeBevyAttendee, type NormalizedAttendee } from "@/lib/server/bevy";
import { getService } from "@/lib/server/context";
import { errorResponse, handleError, json, readJson } from "@/lib/server/http";

const digest = (s: string) => createHash("sha256").update(s).digest();

/**
 * Receives Bevy attendee webhooks (records created/updated) and upserts them.
 * Authenticated with a shared secret: BEVY_WEBHOOK_SECRET, sent as the
 * `x-webhook-secret` header or `?secret=` query parameter.
 */
export async function POST(req: NextRequest) {
  try {
    const expected = process.env.BEVY_WEBHOOK_SECRET;
    if (!expected) return errorResponse(404, "NOT_FOUND", "Webhook not enabled");
    const given = req.headers.get("x-webhook-secret") ?? req.nextUrl.searchParams.get("secret") ?? "";
    if (!timingSafeEqual(digest(given), digest(expected))) return errorResponse(401, "UNAUTHORIZED", "Bad webhook secret");
    const records = extractRecords(await readJson(req, 2_000_000));
    const list = records.map(normalizeBevyAttendee).filter((a): a is NormalizedAttendee => !!a);
    const res = list.length ? await (await getService()).upsertAttendees(list, "bevy") : { created: 0, updated: 0 };
    return json({ received: records.length, ...res });
  } catch (e) {
    return handleError(e);
  }
}
