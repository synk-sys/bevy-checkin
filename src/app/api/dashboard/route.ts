import { getService } from "@/lib/server/context";
import { json, withRole } from "@/lib/server/http";
import { bevyConfigFromEnv } from "@/lib/server/bevy";

export const GET = withRole("staff", async () => {
  const service = await getService();
  const [stats, recent, config] = await Promise.all([service.getStats(), service.recentCheckins(15), service.getConfig()]);
  return json({ stats, recent, config, bevyConfigured: !!bevyConfigFromEnv() });
});
