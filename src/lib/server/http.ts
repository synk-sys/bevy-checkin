import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import type { Role, Session } from "@/lib/types";
import { getSession } from "./auth";
import { CheckinError } from "./checkin-service";

export const json = <T,>(data: T, init: ResponseInit = {}) =>
  NextResponse.json(data, { ...init, headers: { "cache-control": "no-store", ...(init.headers ?? {}) } });

export const errorResponse = (status: number, code: string, message: string) => json({ error: { code, message } }, { status });

export function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === (req.headers.get("x-forwarded-host") ?? req.headers.get("host"));
  } catch {
    return false;
  }
}

export async function readJson(req: NextRequest, max = 16_384): Promise<unknown> {
  if (Number(req.headers.get("content-length") ?? 0) > max) throw new CheckinError("INVALID", "Request too large");
  try {
    return await req.json();
  } catch {
    throw new CheckinError("INVALID", "Invalid JSON body");
  }
}

export function handleError(e: unknown) {
  if (e instanceof CheckinError) return errorResponse(e.code === "NOT_FOUND" ? 404 : e.code === "CONFLICT" ? 409 : 400, e.code, e.message);
  if (e instanceof ZodError) return errorResponse(400, "INVALID", e.issues[0]?.message ?? "Invalid request");
  console.error("[checkin] unexpected error", e);
  return errorResponse(500, "INTERNAL", "Something went wrong. Please try again.");
}

type Handler<C> = (req: NextRequest, session: Session, ctx: C) => Promise<Response>;

/** Every route that touches attendee data goes through this guard. */
export function withRole<C = unknown>(role: Role, handler: Handler<C>) {
  return async (req: NextRequest, ctx: C) => {
    try {
      if (req.method !== "GET" && !sameOrigin(req)) return errorResponse(403, "FORBIDDEN", "Cross-site request blocked");
      const session = await getSession(req);
      if (!session) return errorResponse(401, "UNAUTHORIZED", "Please sign in");
      if (role === "admin" && session.role !== "admin") return errorResponse(403, "FORBIDDEN", "Admins only");
      return await handler(req, session, ctx);
    } catch (e) {
      return handleError(e);
    }
  };
}
