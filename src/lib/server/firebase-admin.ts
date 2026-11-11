import { getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let app: App | undefined;
let firestore: Firestore | undefined;

/**
 * On Firebase App Hosting, Application Default Credentials and FIREBASE_CONFIG
 * are provided automatically. Locally, use `gcloud auth application-default login`
 * or point FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST at emulators.
 */
export function getAdminApp(): App {
  if (app) return app;
  app = getApps()[0] ?? initializeApp(
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ? { projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID } : undefined,
  );
  return app;
}

export function getAdminFirestore(): Firestore {
  if (firestore) return firestore;
  firestore = getFirestore(getAdminApp());
  firestore.settings({ ignoreUndefinedProperties: true });
  return firestore;
}
