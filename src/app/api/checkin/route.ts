import { z } from "zod";
import { deskFrom } from "@/lib/server/auth";
import { getService } from "@/lib/server/context";
import { json, readJson, withRole } from "@/lib/server/http";

const schema = z.union([
  z.object({ code: z.string().min(1).max(500) }).strict(),
  z.object({ attendeeId: z.string().min(1).max(120) }).strict(),
]);

/** Check in by scanned/typed ticket code or by attendee id (from search results). */
export const POST = withRole("staff", async (req, session) => {
  const body = schema.parse(await readJson(req));
  const service = await getService();
  const ctx = { desk: deskFrom(req, session), by: session.name };
  const result = "code" in body ? await service.checkInByCode(body.code, ctx) : await service.checkIn(body.attendeeId, ctx);
  return json(result, { status: result.status === "not_found" ? 404 : 200 });
});
