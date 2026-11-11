/**
 * Supabase Postgres storage when DATABASE_URL is set; otherwise a
 * self-contained local prototype (in-memory store). Sign-in is the same in both.
 */
export const usesDatabase = () => !!process.env.DATABASE_URL;
