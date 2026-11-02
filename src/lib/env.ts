/**
 * Firebase mode when the web config is present; otherwise a self-contained
 * local prototype (in-memory store, passcode sign-in).
 */
export const firebaseWebConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseMode = () => !!(firebaseWebConfig.apiKey && firebaseWebConfig.projectId);
