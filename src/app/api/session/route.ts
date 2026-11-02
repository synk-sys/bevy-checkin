import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isFirebaseMode } from "@/lib/env";
import { SESSION_COOKIE, getSession, issueSession, roleForPasscode } from "@/lib/server/auth";
import { clientIp, errorResponse, handleError, json, readJson, sameOrigin } from "@/lib/server/http";
import { RateLimiter } from "@/lib/server/rate-limit";

const loginLimiter = new RateLimiter(10, 5 * 60_000);

export async function GET(req: NextRequest) {
  return json({ mode: isFirebaseMode() ? "firebase" : "local", session: await getSession(req) });
}

/** Local mode: passcode sign-in for a shift. */
export async function POST(req: NextRequest) {
  try {
    if (isFirebaseMode()) return errorResponse(400, "INVALID", "Use Google sign-in");
    if (!sameOrigin(req)) return errorResponse(403, "FORBIDDEN", "Cross-site request blocked");
    if (!loginLimiter.check(clientIp(req)).ok) return errorResponse(429, "RATE_LIMITED", "Too many attempts. Wait a few minutes.");
    const { passcode, name } = z.object({ passcode: z.string().max(200), name: z.string().min(1).max(40) }).parse(await readJson(req));
    const role = roleForPasscode(passcode);
    if (!role) return errorResponse(401, "UNAUTHORIZED", "Incorrect passcode");
    const res = json({ session: { role, name } });
    issueSession(res, { role, name });
    return res;
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
