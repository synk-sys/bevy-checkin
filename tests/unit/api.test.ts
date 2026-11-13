import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { setServiceForTests } from "@/lib/server/context";
import { CheckinService } from "@/lib/server/checkin-service";
import { MemoryDb } from "@/lib/server/db";
import { demoAttendees } from "@/lib/demo";
import { POST as login } from "@/app/api/session/route";
import { POST as checkin } from "@/app/api/checkin/route";
import { GET as search } from "@/app/api/attendees/search/route";
import { GET as dashboard } from "@/app/api/dashboard/route";
import { GET as exportCsv } from "@/app/api/admin/export/route";
import { POST as sync } from "@/app/api/admin/sync/route";
import { POST as importCsv } from "@/app/api/admin/import/route";
import { POST as webhook } from "@/app/api/bevy/webhook/route";

const BASE = "http://localhost:3000";
const req = (path: string, init: { method?: string; body?: unknown; cookie?: string; headers?: Record<string, string> } = {}) =>
  new NextRequest(BASE + path, {
    method: init.method ?? "GET",
    body: init.body ? JSON.stringify(init.body) : undefined,
    headers: { ...(init.cookie ? { cookie: init.cookie } : {}), ...(init.body ? { "content-type": "application/json" } : {}), ...(init.headers ?? {}) },
  });

// Each sign-in comes from its own address, so the per-IP login limit doesn't trip across tests.
let ip = 0;
const loginReq = (body: Record<string, unknown>) => req("/api/session", { method: "POST", body, headers: { "x-forwarded-for": `10.0.0.${++ip}` } });

async function signIn(password: string, name = "Alex") {
  const res = await login(loginReq({ password, name }));
  expect(res.status).toBe(200);
  return res.headers.get("set-cookie")!.split(";")[0];
}

let service: CheckinService;
beforeEach(async () => {
  service = new CheckinService(new MemoryDb(), { statsCacheMs: 0 });
  await service.upsertAttendees(demoAttendees(30), "demo");
  setServiceForTests(service);
});

describe("access control", () => {
  it("attendee data requires sign-in", async () => {
    expect((await search(req("/api/attendees/search?q=a"), undefined)).status).toBe(401);
    expect((await dashboard(req("/api/dashboard"), undefined)).status).toBe(401);
    expect((await checkin(req("/api/checkin", { method: "POST", body: { code: "x" } }), undefined)).status).toBe(401);
  });

  it("rejects wrong passwords and forged cookies", async () => {
    expect((await login(loginReq({ password: "nope", name: "X" }))).status).toBe(401);
    expect((await search(req("/api/attendees/search?q=ai", { cookie: "checkin_session=eyJyb2xlIjoiYWRtaW4ifQ.forged" }), undefined)).status).toBe(401);
  });

  it("staff can check in but cannot export or sync", async () => {
    const cookie = await signIn("checkin");
    const code = demoAttendees(30)[0].ticketCode;
    const res = await checkin(req("/api/checkin", { method: "POST", cookie, body: { code }, headers: { "x-desk": "Front <b>Desk</b>" } }), undefined);
    const body = await res.json();
    expect(body.status).toBe("checked_in");
    expect(body.attendee.checkedInBy).toBe("Alex");
    expect(body.attendee.desk).toBe("Front bDeskb"); // sanitised desk label
    expect((await exportCsv(req("/api/admin/export", { cookie }), undefined)).status).toBe(403);
    expect((await sync(req("/api/admin/sync", { method: "POST", cookie, body: { source: "demo" } }), undefined)).status).toBe(403);
  });

  it("someone in both lists gets the role of the page they sign in on", async () => {
    process.env.ADMIN_USERS = "Kritima:sunflower42";
    process.env.STAFF_USERS = "Kritima:sunflower42";
    try {
      const volunteerPage = await login(loginReq({ name: "Kritima", password: "sunflower42" }));
      expect(await volunteerPage.json()).toEqual({ session: { role: "staff", name: "Kritima" } });
      const adminPage = await login(loginReq({ name: "Kritima", password: "sunflower42", adminOnly: true }));
      expect(await adminPage.json()).toEqual({ session: { role: "admin", name: "Kritima" } });
    } finally {
      delete process.env.ADMIN_USERS;
      delete process.env.STAFF_USERS;
    }
  });

  it("admin sign-in page only lets admins in", async () => {
    const attempt = (password: string) => login(loginReq({ password, name: "Alex", adminOnly: true }));
    const staff = await attempt("checkin");
    expect(staff.status).toBe(403);
    expect(staff.headers.get("set-cookie")).toBeNull();
    expect(await (await attempt("admin")).json()).toEqual({ session: { role: "admin", name: "Alex" } });
  });

  it("records admin check-ins under Admin, ignoring any desk name sent", async () => {
    const cookie = await signIn("admin");
    const code = demoAttendees(30)[2].ticketCode;
    const body = await (await checkin(req("/api/checkin", { method: "POST", cookie, body: { code }, headers: { "x-desk": "Desk 4" } }), undefined)).json();
    expect(body.attendee.desk).toBe("Admin");
  });

  it("admins can export CSV with formula injection neutralised", async () => {
    await service.createWalkIn({ firstName: "=HYPERLINK(1)", lastName: "", email: "" }, { desk: "D", by: "x" }, true);
    const cookie = await signIn("admin");
    const res = await exportCsv(req("/api/admin/export?status=in", { cookie }), undefined);
    const text = await res.text();
    expect(text).toContain("\"'=HYPERLINK(1)\"");
  });

  it("signs each person in with their own password and role", async () => {
    process.env.ADMIN_USERS = "Kritima:lead:pass";
    process.env.STAFF_USERS = "Priya Shah:p-123, Sam:s-456";
    try {
      const attempt = (name: string, password: string) => login(loginReq({ password, name }));
      expect(await (await attempt("kritima", "lead:pass")).json()).toEqual({ session: { role: "admin", name: "Kritima" } });
      expect(await (await attempt("  priya  SHAH ", "p-123")).json()).toEqual({ session: { role: "staff", name: "Priya Shah" } });
      expect((await attempt("Sam", "p-123")).status).toBe(401); // someone else's password
      expect((await attempt("Alex", "admin")).status).toBe(401); // dev fallback is off once accounts exist
      const cookie = await signIn("s-456", "Sam");
      const code = demoAttendees(30)[1].ticketCode;
      const body = await (await checkin(req("/api/checkin", { method: "POST", cookie, body: { code } }), undefined)).json();
      expect(body.attendee.checkedInBy).toBe("Sam");
    } finally {
      delete process.env.ADMIN_USERS;
      delete process.env.STAFF_USERS;
    }
  });

  it("blocks cross-site check-ins", async () => {
    const cookie = await signIn("checkin");
    const res = await checkin(req("/api/checkin", { method: "POST", cookie, body: { code: "x" }, headers: { origin: "https://evil.test", host: "localhost:3000" } }), undefined);
    expect(res.status).toBe(403);
  });
});

describe("CSV import", () => {
  const upload = (cookie: string, csv: string) =>
    importCsv(new NextRequest(BASE + "/api/admin/import", { method: "POST", body: csv, headers: { cookie, "content-type": "text/csv" } }), undefined);
  const csv = "First Name,Last Name,Email,Ticket Type,Ticket Code\nPriya,Shah,priya@x.com,General,CSV-1\nSam,Lee,sam@x.com,Student,CSV-2\n,,,,\n";

  it("is admin only", async () => {
    expect((await upload(await signIn("checkin"), csv)).status).toBe(403);
  });

  it("imports attendees, then updates them on re-import without losing check-ins", async () => {
    const cookie = await signIn("admin");
    expect(await (await upload(cookie, csv)).json()).toMatchObject({ created: 2, updated: 0, rows: 2 });
    const scan = await (await checkin(req("/api/checkin", { method: "POST", cookie, body: { code: "CSV-1" } }), undefined)).json();
    expect(scan.status).toBe("checked_in");
    const again = await upload(cookie, csv.replace("Sam,Lee", "Samuel,Lee") + "Ada,King,ada@x.com,General,CSV-3\n");
    expect(await again.json()).toMatchObject({ created: 1, updated: 2 });
    expect((await service.lookupByCode("CSV-1"))?.checkedIn).toBe(true);
    expect((await service.lookupByCode("CSV-2"))?.firstName).toBe("Samuel");
  });

  it("accepts a plain Name/Email list without ticket codes", async () => {
    const cookie = await signIn("admin");
    expect(await (await upload(cookie, "Name,Email\nAda Lovelace,ada@x.com\n")).json()).toMatchObject({ created: 1, skipped: 0 });
    const found = await (await search(req("/api/attendees/search?q=lovelace", { cookie }), undefined)).json();
    expect(found.results[0]).toMatchObject({ firstName: "Ada", lastName: "Lovelace" });
  });

  it("explains which columns it found when nothing matches", async () => {
    const res = await upload(await signIn("admin"), "Foo,Bar\n1,2\n");
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toContain("Columns in this file: Foo, Bar");
  });
});

describe("Bevy webhook", () => {
  it("is disabled without a secret, rejects bad secrets, and upserts attendees", async () => {
    delete process.env.BEVY_WEBHOOK_SECRET;
    expect((await webhook(req("/api/bevy/webhook", { method: "POST", body: [] }))).status).toBe(404);
    process.env.BEVY_WEBHOOK_SECRET = "s3cret";
    expect((await webhook(req("/api/bevy/webhook", { method: "POST", body: [], headers: { "x-webhook-secret": "wrong" } }))).status).toBe(401);
    const res = await webhook(
      req("/api/bevy/webhook", { method: "POST", headers: { "x-webhook-secret": "s3cret" }, body: { data: [{ id: 99, first_name: "Web", last_name: "Hook", email: "w@x.com", ticket_code: "WH-1" }] } }),
    );
    expect(await res.json()).toMatchObject({ received: 1, created: 1 });
    expect((await service.lookupByCode("WH-1"))?.firstName).toBe("Web");
    delete process.env.BEVY_WEBHOOK_SECRET;
  });
});
