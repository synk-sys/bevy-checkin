import { getService } from "@/lib/server/context";
import { json, withRole } from "@/lib/server/http";

export const GET = withRole("staff", async (req) => {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  return json({ results: await (await getService()).search(q) });
});
