/**
 * Firestore storage when a Firebase project is configured; otherwise a
 * self-contained local prototype (in-memory store). Sign-in is the same in both.
 */
export const isFirebaseMode = () => !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
