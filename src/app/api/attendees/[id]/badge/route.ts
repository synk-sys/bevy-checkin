import { getService } from "@/lib/server/context";
import { json, withRole } from "@/lib/server/http";

export const POST = withRole<{ params: Promise<{ id: string }> }>("staff", async (_req, _s, { params }) => {
  await (await getService()).markBadgePrinted((await params).id);
  return json({ ok: true });
});
