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
import { DELETE as undoSwag, POST as collectSwag } from "@/app/api/attendees/[id]/swag/route";
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
    const cookie = await signIn("checkin", "Desk 3");
    const code = demoAttendees(30)[0].ticketCode;
    // The desk comes from the sign-in, not from anything the browser sends.
    const res = await checkin(req("/api/checkin", { method: "POST", cookie, body: { code }, headers: { "x-desk": "Desk 5" } }), undefined);
    const body = await res.json();
    expect(body.status).toBe("checked_in");
    expect(body.attendee.checkedInBy).toBe("Desk 3");
    expect(body.attendee.desk).toBe("Desk 3");
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

  it("counts each check-in under the volunteer's desk on the dashboard", async () => {
    const cookie = await signIn("checkin", "Desk 2");
    const [a, b] = demoAttendees(30);
    for (const t of [a, b]) await checkin(req("/api/checkin", { method: "POST", cookie, body: { code: t.ticketCode } }), undefined);
    const { stats } = await (await dashboard(req("/api/dashboard", { cookie }), undefined)).json();
    expect(stats.byDesk).toEqual({ "Desk 2": 2 });
  });

  it("admins can export CSV with formula injection neutralised", async () => {
    await service.createWalkIn({ firstName: "=HYPERLINK(1)", lastName: "", email: "" }, { desk: "D", by: "x" }, true);
    const cookie = await signIn("admin");
    const res = await exportCsv(req("/api/admin/export?status=in", { cookie }), undefined);
    const text = await res.text();
    expect(text).toContain("\"'=HYPERLINK(1)\"");
  });

  it("signs each desk in with its own password", async () => {
    process.env.STAFF_USERS = "Desk 1:d1-pass,Desk 2:d2-pass";
    try {
      const attempt = (name: string, password: string) => login(loginReq({ password, name }));
      expect(await (await attempt("Desk 2", "d2-pass")).json()).toEqual({ session: { role: "staff", name: "Desk 2" } });
      expect((await attempt("Desk 2", "d1-pass")).status).toBe(401); // another desk's password
      expect((await attempt("Desk 3", "d1-pass")).status).toBe(401); // a desk with no account
    } finally {
      delete process.env.STAFF_USERS;
    }
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

describe("swag", () => {
  const swagReq = (cookie: string, id: string, method: "POST" | "DELETE" = "POST") =>
    [req(`/api/attendees/${id}/swag`, { method, cookie }), { params: Promise.resolve({ id }) }] as const;

  it("is recorded once per checked-in attendee, under the desk", async () => {
    const cookie = await signIn("checkin", "Desk 4");
    const a = demoAttendees(30)[5];
    const id = (await service.lookupByCode(a.ticketCode))!.id;
    // Not before check-in.
    const early = await collectSwag(...swagReq(cookie, id));
    expect(early.status).toBe(409);
    expect((await early.json()).error.message).toContain("Check");
    await checkin(req("/api/checkin", { method: "POST", cookie, body: { code: a.ticketCode } }), undefined);
    const first = await (await collectSwag(...swagReq(cookie, id))).json();
    expect(first).toMatchObject({ status: "collected", attendee: { swagDesk: "Desk 4" } });
    expect(first.attendee.swagCollectedAt).toBeTruthy();
    // A second tap is told it was already collected.
    expect((await (await collectSwag(...swagReq(cookie, id))).json()).status).toBe("already");
    expect((await service.getStats()).swagCollected).toBe(1);
    // Undo clears it and the count.
    expect((await (await undoSwag(...swagReq(cookie, id, "DELETE"))).json()).attendee.swagCollectedAt).toBeNull();
    expect((await service.getStats()).swagCollected).toBe(0);
  });

  it("counts once when several desks tap at the same moment", async () => {
    const a = (await service.lookupByCode(demoAttendees(30)[6].ticketCode))!;
    await service.checkIn(a.id, { desk: "Desk 1", by: "Desk 1" });
    const results = await Promise.all([1, 2, 3, 4, 5, 6].map((n) => service.collectSwag(a.id, { desk: `Desk ${n}`, by: `Desk ${n}` })));
    expect(results.filter((r) => r.status === "collected")).toHaveLength(1);
    expect((await service.recountStats()).swagCollected).toBe(1);
  });

  it("is taken back when the check-in is undone", async () => {
    const a = (await service.lookupByCode(demoAttendees(30)[7].ticketCode))!;
    await service.checkIn(a.id, { desk: "Desk 2", by: "Desk 2" });
    await service.collectSwag(a.id, { desk: "Desk 2", by: "Desk 2" });
    expect((await service.getStats()).swagCollected).toBe(1);
    const undone = await service.undoCheckIn(a.id, { desk: "Admin", by: "Ada" });
    expect(undone).toMatchObject({ checkedIn: false, swagCollectedAt: null, swagDesk: null });
    expect((await service.getStats()).swagCollected).toBe(0);
    expect((await service.recountStats()).swagCollected).toBe(0);
    // And it can't be collected again until they're checked back in.
    await expect(service.collectSwag(a.id, { desk: "Desk 2", by: "Desk 2" })).rejects.toThrow("Check");
  });

  it("needs a signed-in desk", async () => {
    expect((await collectSwag(...swagReq("", "x"))).status).toBe(401);
  });
});

describe("CSV export", () => {
  it("lists checked-in attendees in arrival order with order and ticket numbers", async () => {
    const cookie = await signIn("admin");
    const bevy =
      "Order number,Ticket number,First Name,Last Name,Email,Ticket title\n" +
      "GOOGE260000001,GOOGA261111111,Early,Bird,early@x.com,Early Bird\n" +
      "GOOGE260000001,GOOGA261111112,Late,Comer,late@x.com,Early Bird\n" +
      "GOOGE260000003,GOOGA261111113,No,Show,noshow@x.com,Speakers\n";
    await importCsv(new NextRequest(BASE + "/api/admin/import", { method: "POST", body: bevy, headers: { cookie, "content-type": "text/csv" } }), undefined);
    for (const code of ["GOOGA261111112", "GOOGA261111111"]) {
      await checkin(req("/api/checkin", { method: "POST", cookie, body: { code }, headers: { "x-desk": "Desk 3" } }), undefined);
      await new Promise((r) => setTimeout(r, 5));
    }
    const res = await exportCsv(req("/api/admin/export?status=in", { cookie }), undefined);
    expect(res.headers.get("content-disposition")).toContain("attendees-checked-in-");
    const lines = (await res.text()).replace(/^\uFEFF/, "").trim().split("\r\n");
    expect(lines).toEqual([
      '"First Name","Last Name","Email","Company","Ticket Type","Order Number","Ticket Number","Checked In","Swag Collected","Desk"',
      // First to arrive comes first; admins' check-ins are recorded under "Admin".
      '"Late","Comer","late@x.com","","Early Bird","GOOGE260000001","GOOGA261111112","Yes","No","Admin"',
      '"Early","Bird","early@x.com","","Early Bird","GOOGE260000001","GOOGA261111111","Yes","No","Admin"',
    ]);
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

  it("matches Bevy ticket QR codes (event id : ticket digits) to the CSV's ticket numbers", async () => {
    const cookie = await signIn("admin");
    const bevy =
      "Order number,Ticket number,First Name,Last Name,Email,Ticket title,Checkin Date (UTC)\n" +
      "GOOGE260000001,GOOGA261234567,Test,Person,test.person@x.com,Volunteers,\n" +
      "GOOGE260000002,GOOGA261234568,Other,Person,other.person@x.com,Speakers,\n";
    expect(await (await upload(cookie, bevy)).json()).toMatchObject({ created: 2 });
    const scan = await (await checkin(req("/api/checkin", { method: "POST", cookie, body: { code: "100001:1234567" } }), undefined)).json();
    expect(scan.status).toBe("checked_in");
    expect(scan.attendee).toMatchObject({ firstName: "Test", ticketType: "Volunteers" });
    // The full ticket number (typed or printed) still works too.
    const typed = await (await checkin(req("/api/checkin", { method: "POST", cookie, body: { code: "GOOGA261234568" } }), undefined)).json();
    expect(typed.attendee.firstName).toBe("Other");
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
