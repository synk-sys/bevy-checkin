import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { clean } from "@/lib/text";
import type { Role, Session } from "@/lib/types";

export const SESSION_COOKIE = "checkin_session";
const SHIFT_MS = 14 * 60 * 60 * 1000;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET (16+ chars) is required in production");
  return "dev-only-insecure-session-secret";
}
const sign = (v: string) => createHmac("sha256", secret()).update(v).digest("base64url");
function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Staff (check-in volunteers) and admins, signed in with a per-person password; the session is a signed cookie. */
export async function getSession(req: NextRequest): Promise<Session | null> {
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

interface Account {
  name: string;
  password: string;
  role: Role;
}

const nameKey = (n: string) => n.trim().replace(/\s+/g, " ").toLowerCase();

/** Parse "Name:password,Name:password". The first colon splits, so passwords may contain colons but not commas. */
function parseUsers(v: string | undefined, role: Role): Account[] {
  return (v ?? "")
    .split(",")
    .map((entry) => {
      const i = entry.indexOf(":");
      return i > 0 ? { name: entry.slice(0, i).trim(), password: entry.slice(i + 1).trim(), role } : null;
    })
    .filter((a): a is Account => !!a?.name && !!a.password);
}

/** Accounts from ADMIN_USERS / STAFF_USERS. A name may be in both lists. */
export function accounts(): Account[] {
  return [...parseUsers(process.env.ADMIN_USERS, "admin"), ...parseUsers(process.env.STAFF_USERS, "staff")];
}

/**
 * Check a name + password. Names match case-insensitively; the session uses the configured spelling.
 * When the name and password match accounts in both lists, `prefer` picks the role (the volunteer
 * sign-in page prefers staff, the admin page admin); otherwise admin wins.
 * With no accounts configured outside production, any name works with "admin" or "checkin".
 */
export function authenticate(name: string, password: string, prefer?: Role): Session | null {
  const list = accounts();
  if (!list.length) {
    if (process.env.NODE_ENV === "production") return null;
    const role = safeEqual(sign(password), sign("admin")) ? "admin" : safeEqual(sign(password), sign("checkin")) ? "staff" : null;
    return role && { role, name };
  }
  // Check every account so timing doesn't reveal which names exist.
  const matches = list.filter((a) => safeEqual(sign(password), sign(a.password)) && nameKey(a.name) === nameKey(name));
  const match = matches.find((a) => a.role === prefer) ?? matches[0];
  return match ? { role: match.role, name: match.name } : null;
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

/** Label recorded with an action. Admins have no desk; staff send theirs (x-desk header), sanitised. */
export const ADMIN_DESK = "Admin";

export function deskFrom(req: NextRequest, session: Session) {
  if (session.role === "admin") return ADMIN_DESK;
  return clean(req.headers.get("x-desk") ?? "", 32).replace(/[^\w \-#]/g, "") || "Desk";
}
