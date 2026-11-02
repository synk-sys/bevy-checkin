import { getService } from "@/lib/server/context";
import { json, withRole } from "@/lib/server/http";

export const GET = withRole("admin", async (req) => {
  const s = req.nextUrl.searchParams.get("status");
  const filter = s === "in" ? { checkedIn: true } : s === "out" ? { checkedIn: false } : {};
  return json({ attendees: await (await getService()).listAll(filter) });
});
