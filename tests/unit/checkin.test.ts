import { describe, expect, it } from "vitest";
import { demoAttendees } from "@/lib/demo";
import { desk, makeService } from "./helpers";

describe("check-in", () => {
  it("checks in by scanned ticket code and is idempotent", async () => {
    const { service } = await makeService(20);
    const code = demoAttendees(20)[3].ticketCode;
    const first = await service.checkInByCode(code, desk());
    expect(first.status).toBe("checked_in");
    const second = await service.checkInByCode(code, desk("Desk 2"));
    expect(second.status).toBe("already");
    if (second.status === "already") expect(second.attendee.desk).toBe("Desk 1");
    const stats = await service.getStats();
    expect(stats.checkedIn).toBe(1);
    expect(stats.byDesk["Desk 1"]).toBe(1);
  });

  it("only one desk wins when the same ticket is scanned simultaneously", async () => {
    const { service } = await makeService(5);
    const code = demoAttendees(5)[0].ticketCode;
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => service.checkInByCode(code, desk(`Desk ${i}`))));
    expect(results.filter((r) => r.status === "checked_in")).toHaveLength(1);
    expect(results.filter((r) => r.status === "already")).toHaveLength(9);
    expect((await service.getStats()).checkedIn).toBe(1);
  });

  it("handles a burst of different attendees across desks", async () => {
    const { service } = await makeService(150);
    const codes = demoAttendees(150).map((a) => a.ticketCode);
    const results = await Promise.all(codes.map((c, i) => service.checkInByCode(c, desk(`Desk ${i % 4}`))));
    expect(results.every((r) => r.status === "checked_in")).toBe(true);
    const stats = await service.getStats();
    expect(stats.checkedIn).toBe(150);
    expect(Object.values(stats.byDesk).reduce((a, b) => a + b, 0)).toBe(150);
    expect(await service.recountStats()).toMatchObject({ checkedIn: 150, total: 150 });
  });

  it("matches codes inside URLs, prefixes and with different casing", async () => {
    const { service } = await makeService(10);
    const code = demoAttendees(10)[2].ticketCode;
    for (const scanned of [code.toLowerCase(), `https://example.bevy.com/ticket/${code}`, `https://x.test/t?ticket=${code}`, `BEVY:${code}`]) {
      expect((await service.lookupByCode(scanned))?.ticketCode).toBe(code);
    }
    expect((await service.checkInByCode("NOPE-000", desk())).status).toBe("not_found");
  });

  it("undo reverses a check-in and its stats", async () => {
    const { service } = await makeService(5);
    const a = (await service.listAll())[0];
    await service.checkIn(a.id, desk());
    const undone = await service.undoCheckIn(a.id, desk());
    expect(undone.checkedIn).toBe(false);
    expect((await service.getStats()).checkedIn).toBe(0);
    expect((await service.checkIn(a.id, desk())).status).toBe("checked_in");
    const recent = await service.recentCheckins();
    expect(recent.map((r) => r.action)).toEqual(["checkin", "undo", "checkin"]);
  });
});

describe("search", () => {
  it("finds by first name, last name, email prefix and ticket code, accent-insensitive", async () => {
    const { service } = await makeService(0);
    await service.upsertAttendees(
      [
        { bevyId: "1", ticketCode: "T-1", firstName: "José", lastName: "Côté", email: "jose@example.com", company: "", title: "", ticketType: "General", checkedIn: false },
        { bevyId: "2", ticketCode: "T-2", firstName: "Joanna", lastName: "Smith", email: "jo.smith@example.com", company: "", title: "", ticketType: "Student", checkedIn: false },
      ],
      "demo",
    );
    expect((await service.search("jos")).map((r) => r.firstName)).toEqual(["José"]);
    expect((await service.search("cote")).map((r) => r.firstName)).toEqual(["José"]);
    expect((await service.search("jo")).length).toBe(2);
    expect((await service.search("jo.smith@")).map((r) => r.lastName)).toEqual(["Smith"]);
    expect((await service.search("t-2")).map((r) => r.lastName)).toEqual(["Smith"]);
    expect(await service.search("j")).toEqual([]);
  });
});

describe("walk-ins and imports", () => {
  it("creates and checks in a walk-in, rejecting duplicate emails", async () => {
    const { service } = await makeService(3);
    const { attendee, result } = await service.createWalkIn({ firstName: "Sam", lastName: "Doe", email: "sam@example.com" }, desk(), true);
    expect(attendee.source).toBe("walkin");
    expect(result?.status).toBe("checked_in");
    expect((await service.lookupByCode(attendee.ticketCode))?.id).toBe(attendee.id);
    await expect(service.createWalkIn({ firstName: "Sam", lastName: "Again", email: "SAM@example.com" }, desk(), true)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await service.getStats()).toMatchObject({ total: 4, walkins: 1, checkedIn: 1 });
  });

  it("re-importing preserves local check-in state", async () => {
    const { service } = await makeService(10);
    const first = (await service.listAll())[0];
    await service.checkIn(first.id, desk());
    const again = await service.upsertAttendees(demoAttendees(12), "demo");
    expect(again).toEqual({ created: 2, updated: 10 });
    expect((await service.get(first.id))?.checkedIn).toBe(true);
    expect(await service.getStats()).toMatchObject({ total: 12, checkedIn: 1 });
  });

  it("badge printing is counted once per attendee", async () => {
    const { service } = await makeService(2);
    const a = (await service.listAll())[0];
    await service.markBadgePrinted(a.id);
    await service.markBadgePrinted(a.id);
    expect((await service.getStats()).badgesPrinted).toBe(1);
  });
});
