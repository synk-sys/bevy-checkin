import { describe, expect, it } from "vitest";
import { csvRecords, headerKey, parseCsv } from "@/lib/csv";
import { normalizeBevyAttendee } from "@/lib/server/bevy";

describe("CSV import", () => {
  it("parses quotes, embedded commas and newlines, CRLF and a BOM", () => {
    const text = '﻿Name,Note\r\n"Shah, Priya","said ""hi""\nthen left"\r\nSam,\r\n\r\n';
    expect(parseCsv(text)).toEqual([
      ["Name", "Note"],
      ["Shah, Priya", 'said "hi"\nthen left'],
      ["Sam", ""],
    ]);
  });

  it("detects semicolon-separated files", () => {
    expect(parseCsv("a;b\n1;2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("normalises headers", () => {
    expect(headerKey(" First Name ")).toBe("first_name");
    expect(headerKey("Ticket-ID")).toBe("ticket_id");
  });

  it("maps a Bevy-style export to attendees", () => {
    const { records } = csvRecords(
      "First Name,Last Name,Email,Ticket Title,Ticket ID,Order ID,Checked In\n" +
        "Priya,Shah,PRIYA@x.com,General Admission,T-100,O-1,Yes\n" +
        "Sam,Lee,sam@x.com,Student,T-101,O-1,No\n",
    );
    const [priya, sam] = records.map(normalizeBevyAttendee);
    expect(priya).toMatchObject({ firstName: "Priya", lastName: "Shah", email: "priya@x.com", ticketType: "General Admission", ticketCode: "T-100", checkedIn: true });
    // Same order, different tickets: each attendee keeps their own ticket code.
    expect(sam).toMatchObject({ ticketCode: "T-101", ticketType: "Student", checkedIn: false });
  });
});
