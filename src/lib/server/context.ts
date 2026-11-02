import { isFirebaseMode } from "@/lib/env";
import { MemoryDb, type DocDb } from "./db";
import { CheckinService } from "./checkin-service";

const g = globalThis as unknown as { __checkinService?: CheckinService };
let pending: Promise<CheckinService> | null = null;

async function createDb(): Promise<DocDb> {
  if (isFirebaseMode()) {
    const [{ getAdminFirestore }, { FirestoreDb }] = await Promise.all([import("./firebase-admin"), import("./firestore-db")]);
    return new FirestoreDb(getAdminFirestore());
  }
  return new MemoryDb();
}

export function getService(): Promise<CheckinService> {
  if (g.__checkinService) return Promise.resolve(g.__checkinService);
  pending ??= createDb().then((db) => (g.__checkinService = new CheckinService(db)));
  return pending;
}

export function setServiceForTests(s: CheckinService | undefined) {
  g.__checkinService = s;
  pending = null;
}

/** Demo data and full reset: on by default locally, off in Firebase mode unless enabled. */
export const demoAllowed = () =>
  process.env.ALLOW_DEMO_DATA === "true" || (!isFirebaseMode() && process.env.ALLOW_DEMO_DATA !== "false");
