import { z } from "zod";
import { demoAttendees } from "@/lib/demo";
import { bevyConfigFromEnv, fetchBevyAttendees } from "@/lib/server/bevy";
import { demoAllowed, getService } from "@/lib/server/context";
import { errorResponse, json, readJson, withRole } from "@/lib/server/http";

const schema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("bevy") }),
  z.object({ source: z.literal("demo"), count: z.number().int().min(1).max(2000).default(240) }),
]);

/** Import attendees from the Bevy API, or load dummy attendees for rehearsals. */
export const POST = withRole("admin", async (req, session) => {
  const body = schema.parse(await readJson(req));
  const service = await getService();
  if (body.source === "demo") {
    if (!demoAllowed()) return errorResponse(403, "FORBIDDEN", "Demo data is disabled on this deployment");
    const res = await service.upsertAttendees(demoAttendees(body.count), "demo");
    return json({ ...res, source: "demo" });
  }
  const cfg = bevyConfigFromEnv();
  if (!cfg) return errorResponse(400, "NOT_CONFIGURED", "Bevy API is not configured. Set BEVY_API_BASE_URL, BEVY_API_TOKEN and BEVY_EVENT_ID.");
  try {
    const list = await fetchBevyAttendees(cfg);
    const res = await service.upsertAttendees(list, "bevy");
    await service.updateConfig({ lastSyncAt: new Date().toISOString(), lastSyncCount: list.length, lastSyncError: null });
    console.info("[checkin] bevy sync", { by: session.name, ...res });
    return json({ ...res, source: "bevy" });
  } catch (e) {
    const message = (e as Error).message;
    await service.updateConfig({ lastSyncError: message.slice(0, 200) });
    return errorResponse(502, "BEVY_ERROR", `Bevy sync failed: ${message}`);
  }
});
