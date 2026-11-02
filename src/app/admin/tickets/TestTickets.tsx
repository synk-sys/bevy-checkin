"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client/api";
import type { AttendeeView } from "@/lib/types";

/** QR tickets for not-yet-checked-in attendees, to rehearse scanning with a phone or webcam. */
export function TestTickets() {
  const [tickets, setTickets] = useState<{ a: AttendeeView; qr: string }[]>([]);
  useEffect(() => {
    (async () => {
      const { attendees } = await api<{ attendees: AttendeeView[] }>("/api/admin/attendees?status=out");
      const first = attendees.slice(0, 24);
      setTickets(await Promise.all(first.map(async (a) => ({ a, qr: await QRCode.toDataURL(a.ticketCode, { margin: 1, width: 240 }) }))));
    })().catch(() => {});
  }, []);
  return (
    <div className="space-y-4">
      <div className="no-print flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Test tickets</h1>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer /> Print sheet
        </Button>
      </div>
      <p className="no-print text-muted-foreground">Hold these up to the desk camera (or scan from a second screen) to practise. Shows up to 24 attendees who aren&apos;t checked in.</p>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {tickets.map(({ a, qr }) => (
          <li key={a.id} className="break-inside-avoid rounded-xl border bg-card p-3 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
            <img src={qr} alt={`QR ticket ${a.ticketCode}`} className="mx-auto size-36" />
            <p className="mt-2 font-semibold">
              {a.firstName} {a.lastName}
            </p>
            <p className="font-mono text-xs text-muted-foreground">{a.ticketCode}</p>
          </li>
        ))}
      </ul>
      {tickets.length === 0 && <p className="text-muted-foreground">No unchecked attendees — load demo data first.</p>}
    </div>
  );
}
