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
import { POST as webhook } from "@/app/api/bevy/webhook/route";

const BASE = "http://localhost:3000";
const req = (path: string, init: { method?: string; body?: unknown; cookie?: string; headers?: Record<string, string> } = {}) =>
  new NextRequest(BASE + path, {
    method: init.method ?? "GET",
    body: init.body ? JSON.stringify(init.body) : undefined,
    headers: { ...(init.cookie ? { cookie: init.cookie } : {}), ...(init.body ? { "content-type": "application/json" } : {}), ...(init.headers ?? {}) },
  });

async function signIn(passcode: string) {
  const res = await login(req("/api/session", { method: "POST", body: { passcode, name: "Alex" } }));
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

  it("rejects wrong passcodes and forged cookies", async () => {
    expect((await login(req("/api/session", { method: "POST", body: { passcode: "nope", name: "X" } }))).status).toBe(401);
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

  it("admins can export CSV with formula injection neutralised", async () => {
    await service.createWalkIn({ firstName: "=HYPERLINK(1)", lastName: "", email: "" }, { desk: "D", by: "x" }, true);
    const cookie = await signIn("admin");
    const res = await exportCsv(req("/api/admin/export?status=in", { cookie }), undefined);
    const text = await res.text();
    expect(text).toContain("\"'=HYPERLINK(1)\"");
  });

  it("blocks cross-site check-ins", async () => {
    const cookie = await signIn("checkin");
    const res = await checkin(req("/api/checkin", { method: "POST", cookie, body: { code: "x" }, headers: { origin: "https://evil.test", host: "localhost:3000" } }), undefined);
    expect(res.status).toBe(403);
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
