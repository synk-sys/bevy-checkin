import { clean } from "@/lib/text";

/**
 * Bevy integration.
 *
 * Bevy does not publish a public API reference, so everything about the
 * endpoint is configurable via environment variables (see .env.example) and
 * attendee records go through a tolerant normalizer that accepts the common
 * field spellings seen in Bevy API responses, webhook payloads and CSV
 * exports. Adjust BEVY_* variables to match the API access Bevy grants you.
 */
export interface NormalizedAttendee {
  bevyId: string;
  ticketCode: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  title: string;
  ticketType: string;
  checkedIn: boolean;
}

type Rec = Record<string, unknown>;

function get(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (cur && typeof cur === "object" && part in (cur as Rec)) cur = (cur as Rec)[part];
    else return undefined;
  }
  return cur;
}

function pick(obj: unknown, paths: string[]): string {
  for (const p of paths) {
    const v = get(obj, p);
    if ((typeof v === "string" && v.trim()) || typeof v === "number") return clean(v, 200);
  }
  return "";
}

function truthy(obj: unknown, paths: string[]): boolean {
  for (const p of paths) {
    const v = get(obj, p);
    if (v === true || v === 1 || v === "true" || v === "yes") return true;
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return true; // a check-in timestamp
    if (typeof v === "number" && v > 0 && p.includes("count")) return true;
  }
  return false;
}

export function normalizeBevyAttendee(raw: unknown): NormalizedAttendee | null {
  if (!raw || typeof raw !== "object") return null;
  const bevyId = pick(raw, ["id", "attendee_id", "attendeeId", "uuid", "registration_id", "user.id"]);
  let firstName = pick(raw, ["first_name", "firstName", "given_name", "user.first_name", "user.firstName", "profile.first_name"]);
  let lastName = pick(raw, ["last_name", "lastName", "family_name", "surname", "user.last_name", "user.lastName", "profile.last_name"]);
  if (!firstName && !lastName) {
    const full = pick(raw, ["name", "full_name", "fullName", "display_name", "user.name", "user.full_name"]);
    const [f, ...rest] = full.split(" ");
    firstName = f ?? "";
    lastName = rest.join(" ");
  }
  const email = pick(raw, ["email", "email_address", "emailAddress", "user.email", "profile.email"]).toLowerCase();
  const ticketCode =
    pick(raw, ["ticket_code", "ticketCode", "ticket_number", "ticketNumber", "barcode", "qr_code", "qrCode", "code", "order_id", "orderId", "ticket.code", "ticket.id"]) ||
    bevyId;
  if (!bevyId && !ticketCode) return null;
  if (!firstName && !lastName && !email) return null;
  return {
    bevyId: bevyId || ticketCode,
    ticketCode,
    firstName,
    lastName,
    email,
    company: pick(raw, ["company", "company_name", "organization", "organisation", "user.company", "profile.company", "employer"]),
    title: pick(raw, ["title", "job_title", "jobTitle", "user.title", "profile.title"]),
    ticketType: pick(raw, ["ticket_type", "ticketType", "ticket.title", "ticket.name", "ticket_name", "ticket_title", "ticket", "registration_type"]) || "General",
    checkedIn: truthy(raw, ["checked_in", "checkedIn", "is_checked_in", "checkin_time", "checked_in_at", "checkedInAt", "checkin_count"]),
  };
}

/** Pull the list of records out of the common API / webhook envelope shapes. */
export function extractRecords(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object") {
    for (const k of ["results", "data", "attendees", "items", "records", "objects"]) {
      const v = (body as Rec)[k];
      if (Array.isArray(v)) return v;
      if (v && typeof v === "object" && Array.isArray((v as Rec).attendees)) return (v as Rec).attendees as unknown[];
    }
    if ((body as Rec).attendee) return [(body as Rec).attendee];
  }
  return [];
}

function nextLink(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  for (const p of ["next", "links.next", "meta.next", "pagination.next", "paging.next", "_links.next.href"]) {
    const v = get(body, p);
    if (typeof v === "string" && v) return v;
  }
  return null;
}

export interface BevyConfig {
  baseUrl: string;
  token: string;
  eventId: string;
  attendeesPath: string;
  authHeader: string;
  authScheme: string;
  pageSize: number;
}

export function bevyConfigFromEnv(env = process.env): BevyConfig | null {
  if (!env.BEVY_API_BASE_URL || !env.BEVY_API_TOKEN || !env.BEVY_EVENT_ID) return null;
  return {
    baseUrl: env.BEVY_API_BASE_URL.replace(/\/$/, ""),
    token: env.BEVY_API_TOKEN,
    eventId: env.BEVY_EVENT_ID,
    attendeesPath: env.BEVY_ATTENDEES_PATH || "/api/v1/events/{eventId}/attendees",
    authHeader: env.BEVY_AUTH_HEADER || "Authorization",
    authScheme: env.BEVY_AUTH_SCHEME ?? "Token",
    pageSize: Number(env.BEVY_PAGE_SIZE) || 200,
  };
}

/** Fetch every attendee page for the configured event. */
export async function fetchBevyAttendees(
  cfg: BevyConfig,
  fetchImpl: typeof fetch = fetch,
  maxPages = 200,
): Promise<NormalizedAttendee[]> {
  const first = new URL(cfg.baseUrl + cfg.attendeesPath.replace("{eventId}", encodeURIComponent(cfg.eventId)));
  if (!first.searchParams.has("page_size")) first.searchParams.set("page_size", String(cfg.pageSize));
  const allowedOrigin = first.origin;
  const out: NormalizedAttendee[] = [];
  let url: string | null = first.toString();
  for (let page = 0; url && page < maxPages; page++) {
    const target: URL = new URL(url, first);
    // Never send the API token to a different host than the configured one.
    if (target.origin !== allowedOrigin) throw new Error(`Refusing to follow pagination to ${target.origin}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    let res: Response;
    try {
      res = await fetchImpl(target.toString(), {
        signal: controller.signal,
        headers: {
          accept: "application/json",
          [cfg.authHeader]: cfg.authScheme ? `${cfg.authScheme} ${cfg.token}` : cfg.token,
        },
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`Bevy API responded ${res.status} for ${target.pathname}`);
    const body = await res.json();
    const records = extractRecords(body);
    for (const r of records) {
      const n = normalizeBevyAttendee(r);
      if (n) out.push(n);
    }
    url = records.length ? nextLink(body) : null;
  }
  return out;
}
