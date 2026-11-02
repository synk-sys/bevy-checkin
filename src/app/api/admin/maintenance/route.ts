import { z } from "zod";
import { demoAllowed, getService } from "@/lib/server/context";
import { errorResponse, json, readJson, withRole } from "@/lib/server/http";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("recount") }),
  z.object({ action: z.literal("reset"), confirm: z.literal("RESET") }),
]);

export const POST = withRole("admin", async (req) => {
  const body = schema.parse(await readJson(req));
  const service = await getService();
  if (body.action === "recount") return json({ stats: await service.recountStats() });
  if (!demoAllowed()) return errorResponse(403, "FORBIDDEN", "Reset is disabled on this deployment");
  await service.resetAll();
  return json({ ok: true });
});
