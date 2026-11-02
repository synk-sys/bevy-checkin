import { describe, expect, it, vi } from "vitest";
import { bevyConfigFromEnv, extractRecords, fetchBevyAttendees, normalizeBevyAttendee } from "@/lib/server/bevy";

describe("Bevy normalizer", () => {
  it("accepts snake_case, camelCase and nested shapes", () => {
    expect(normalizeBevyAttendee({ id: 7, first_name: "Ada", last_name: "Lovelace", email: "ADA@x.com", ticket: { title: "Speaker", code: "AB12" }, checked_in: true })).toMatchObject({
      bevyId: "7",
      firstName: "Ada",
      email: "ada@x.com",
      ticketType: "Speaker",
      ticketCode: "AB12",
      checkedIn: true,
    });
    expect(normalizeBevyAttendee({ attendeeId: "x1", user: { name: "Grace Brewster Hopper", email: "g@x.com" }, ticketType: "General", checkedInAt: null })).toMatchObject({
      firstName: "Grace",
      lastName: "Brewster Hopper",
      ticketCode: "x1",
      checkedIn: false,
    });
    expect(normalizeBevyAttendee({ foo: "bar" })).toBeNull();
    expect(normalizeBevyAttendee(null)).toBeNull();
  });

  it("extracts records from common envelopes", () => {
    expect(extractRecords([{ a: 1 }])).toHaveLength(1);
    expect(extractRecords({ results: [1, 2] })).toHaveLength(2);
    expect(extractRecords({ data: { attendees: [1] } })).toHaveLength(1);
    expect(extractRecords({ attendee: { id: 1 } })).toHaveLength(1);
  });
});

describe("Bevy API client", () => {
  const cfg = bevyConfigFromEnv({ BEVY_API_BASE_URL: "https://api.bevy.test", BEVY_API_TOKEN: "secret", BEVY_EVENT_ID: "123" } as unknown as NodeJS.ProcessEnv)!;

  it("follows pagination and sends the token", async () => {
    const pages: Record<string, unknown> = {
      "https://api.bevy.test/api/v1/events/123/attendees?page_size=200": {
        results: [{ id: 1, first_name: "A", email: "a@x.com" }],
        next: "https://api.bevy.test/api/v1/events/123/attendees?page=2",
      },
      "https://api.bevy.test/api/v1/events/123/attendees?page=2": { results: [{ id: 2, first_name: "B", email: "b@x.com" }], next: null },
    };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).Authorization).toBe("Token secret");
      return new Response(JSON.stringify(pages[url]), { status: 200 });
    });
    const list = await fetchBevyAttendees(cfg, fetchMock as unknown as typeof fetch);
    expect(list.map((a) => a.bevyId)).toEqual(["1", "2"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refuses to send the token to another host via pagination", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ results: [{ id: 1, first_name: "A", email: "a@x.com" }], next: "https://evil.test/steal" })));
    await expect(fetchBevyAttendees(cfg, fetchMock as unknown as typeof fetch)).rejects.toThrow(/Refusing/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces API errors", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 401 }));
    await expect(fetchBevyAttendees(cfg, fetchMock as unknown as typeof fetch)).rejects.toThrow(/401/);
  });

  it("is unconfigured without credentials", () => {
    expect(bevyConfigFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
  });
});
