import { MemoryDb } from "@/lib/server/db";
import { CheckinService } from "@/lib/server/checkin-service";
import { demoAttendees } from "@/lib/demo";

export async function makeService(count = 0) {
  const db = new MemoryDb({ jitter: true, maxAttempts: 60 });
  const service = new CheckinService(db, { statsCacheMs: 0 });
  if (count) await service.upsertAttendees(demoAttendees(count), "demo");
  return { db, service };
}

export const desk = (name = "Desk 1") => ({ desk: name, by: "Volunteer" });
