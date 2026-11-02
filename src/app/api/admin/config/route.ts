import { z } from "zod";
import { getService } from "@/lib/server/context";
import { json, readJson, withRole } from "@/lib/server/http";

const schema = z.object({ eventName: z.string().min(1).max(80).optional(), autoPrintBadge: z.boolean().optional() }).strict();

export const PATCH = withRole("admin", async (req) => {
  const patch = schema.parse(await readJson(req));
  return json({ config: await (await getService()).updateConfig(patch) });
});
