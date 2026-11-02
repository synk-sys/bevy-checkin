"use client";

import { getApps, initializeApp } from "firebase/app";
import { firebaseWebConfig, isFirebaseMode } from "@/lib/env";

export async function getClientAuth() {
  if (!isFirebaseMode()) return null;
  const app = getApps()[0] ?? initializeApp(firebaseWebConfig);
  const { getAuth } = await import("firebase/auth");
  return getAuth(app);
}
