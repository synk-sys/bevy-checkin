import { z } from "zod";
import { deskFrom } from "@/lib/server/auth";
import { getService } from "@/lib/server/context";
import { toView } from "@/lib/server/checkin-service";
import { errorResponse, json, readJson, withRole } from "@/lib/server/http";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRole<Ctx>("staff", async (_req, _s, { params }) => {
  const a = await (await getService()).get((await params).id);
  return a ? json({ attendee: toView(a) }) : errorResponse(404, "NOT_FOUND", "Attendee not found");
});

/** Admin: undo a mistaken check-in. */
export const PATCH = withRole<Ctx>("admin", async (req, session, { params }) => {
  z.object({ action: z.literal("undo") }).strict().parse(await readJson(req));
  const attendee = await (await getService()).undoCheckIn((await params).id, { desk: deskFrom(req, session), by: session.name });
  return json({ attendee });
});
