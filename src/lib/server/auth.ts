import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { isFirebaseMode } from "@/lib/env";
import { clean } from "@/lib/text";
import type { Role, Session } from "@/lib/types";

export const SESSION_COOKIE = "checkin_session";
const SHIFT_MS = 14 * 60 * 60 * 1000;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production" && !isFirebaseMode()) throw new Error("SESSION_SECRET (16+ chars) is required in production");
  return "dev-only-insecure-session-secret";
}
const sign = (v: string) => createHmac("sha256", secret()).update(v).digest("base64url");
function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

const list = (v?: string) => (v ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

/** Staff (check-in volunteers) and admins. Firebase: Google sign-in + allow-lists. Local: passcodes. */
export async function getSession(req: NextRequest): Promise<Session | null> {
  if (isFirebaseMode()) {
    const h = req.headers.get("authorization") ?? "";
    if (!h.startsWith("Bearer ")) return null;
    try {
      const { getAdminAuth } = await import("./firebase-admin");
      const d = await getAdminAuth().verifyIdToken(h.slice(7));
      const email = d.email?.toLowerCase();
      if (!email || d.email_verified !== true) return null;
      const domain = email.split("@")[1];
      if (d.role === "admin" || list(process.env.ADMIN_EMAILS).includes(email)) return { role: "admin", name: d.name ?? email };
      if (d.role === "staff" || list(process.env.STAFF_EMAILS).includes(email) || list(process.env.STAFF_DOMAINS).includes(domain)) {
        return { role: "staff", name: d.name ?? email };
      }
      return null;
    } catch {
      return null;
    }
  }
  const raw = req.cookies.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const i = raw.lastIndexOf(".");
  if (i <= 0 || !safeEqual(raw.slice(i + 1), sign(raw.slice(0, i)))) return null;
  try {
    const p = JSON.parse(Buffer.from(raw.slice(0, i), "base64url").toString()) as Session & { exp: number };
    if (p.exp < Date.now() || (p.role !== "staff" && p.role !== "admin")) return null;
    return { role: p.role, name: p.name };
  } catch {
    return null;
  }
}

export function passcodeFor(role: Role): string | null {
  const v = role === "admin" ? process.env.ADMIN_PASSCODE : process.env.STAFF_PASSCODE;
  if (v) return v;
  if (process.env.NODE_ENV === "production") return null;
  return role === "admin" ? "admin" : "checkin";
}

/** Match a passcode to a role (admin passcode wins). */
export function roleForPasscode(input: string): Role | null {
  for (const role of ["admin", "staff"] as Role[]) {
    const expected = passcodeFor(role);
    if (expected && safeEqual(sign(input), sign(expected))) return role;
  }
  return null;
}

export function issueSession(res: NextResponse, session: Session) {
  const payload = Buffer.from(JSON.stringify({ ...session, name: clean(session.name, 40), exp: Date.now() + SHIFT_MS })).toString("base64url");
  res.cookies.set(SESSION_COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SHIFT_MS / 1000,
  });
}

/** Desk label sent by the station (x-desk header), sanitised. */
export function deskFrom(req: NextRequest) {
  return clean(req.headers.get("x-desk") ?? "", 32).replace(/[^\w \-#]/g, "") || "Desk";
}
