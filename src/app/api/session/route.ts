import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE, authenticate, getSession, issueSession } from "@/lib/server/auth";
import { clientIp, errorResponse, handleError, json, readJson, sameOrigin } from "@/lib/server/http";
import { RateLimiter } from "@/lib/server/rate-limit";

const loginLimiter = new RateLimiter(10, 5 * 60_000);

export async function GET(req: NextRequest) {
  return json({ session: await getSession(req) });
}

/** Name + password sign-in for a shift. */
export async function POST(req: NextRequest) {
  try {
    if (!sameOrigin(req)) return errorResponse(403, "FORBIDDEN", "Cross-site request blocked");
    if (!loginLimiter.check(clientIp(req)).ok) return errorResponse(429, "RATE_LIMITED", "Too many attempts. Wait a few minutes.");
    const { password, name } = z.object({ password: z.string().max(200), name: z.string().min(1).max(40) }).parse(await readJson(req));
    const session = authenticate(name, password);
    if (!session) return errorResponse(401, "UNAUTHORIZED", "Incorrect name or password");
    const res = json({ session });
    issueSession(res, session);
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
