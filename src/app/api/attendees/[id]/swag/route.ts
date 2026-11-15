import { deskFrom } from "@/lib/server/auth";
import { getService } from "@/lib/server/context";
import { json, withRole } from "@/lib/server/http";

type Ctx = { params: Promise<{ id: string }> };

/** Desk: mark that a checked-in attendee picked up their swag ("already" if they had). */
export const POST = withRole<Ctx>("staff", async (req, session, { params }) => {
  return json(await (await getService()).collectSwag((await params).id, { desk: deskFrom(req, session), by: session.name }));
});

/** Desk: undo a swag pickup tapped by mistake. */
export const DELETE = withRole<Ctx>("staff", async (_req, _s, { params }) => {
  return json({ attendee: await (await getService()).undoSwag((await params).id) });
});
