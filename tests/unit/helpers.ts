import postgres from "postgres";
import { MemoryDb, type DocDb } from "@/lib/server/db";
import { PostgresDb } from "@/lib/server/postgres-db";
import { CheckinService } from "@/lib/server/checkin-service";
import { demoAttendees } from "@/lib/demo";

/** Set TEST_DATABASE_URL to run the service tests against a real (throwaway!) Postgres instead of MemoryDb. */
const pgUrl = process.env.TEST_DATABASE_URL;
const pg = pgUrl ? postgres(pgUrl, { prepare: false, max: 10, onnotice: () => {} }) : null;

export async function makeService(count = 0) {
  let db: DocDb;
  if (pg) {
    await pg`drop table if exists checkin_docs`;
    db = new PostgresDb(pg);
  } else {
    db = new MemoryDb({ jitter: true, maxAttempts: 60 });
  }
  const service = new CheckinService(db, { statsCacheMs: 0 });
  if (count) await service.upsertAttendees(demoAttendees(count), "demo");
  return { db, service };
}

export const desk = (name = "Desk 1") => ({ desk: name, by: "Volunteer" });
