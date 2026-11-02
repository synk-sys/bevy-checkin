"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { api } from "@/lib/client/api";
import { ticketColor, type AttendeeView, type EventConfig } from "@/lib/types";

/**
 * Printable 4" × 3" name badge (common badge-printer / label stock size).
 * In ?embed=1 mode (hidden iframe from the desk) it prints itself once ready.
 */
export function BadgeView() {
  const { id } = useParams<{ id: string }>();
  const embed = useSearchParams().get("embed") === "1";
  const [a, setA] = useState<AttendeeView | null>(null);
  const [eventName, setEventName] = useState("");
  const [qr, setQr] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [{ attendee }, { config }] = await Promise.all([
        api<{ attendee: AttendeeView }>(`/api/attendees/${encodeURIComponent(id)}`),
        api<{ config: EventConfig }>("/api/dashboard"),
      ]);
      setA(attendee);
      setEventName(config.eventName);
      setQr(await QRCode.toDataURL(attendee.ticketCode, { margin: 0, width: 200 }));
    })().catch((e) => setError((e as Error).message));
  }, [id]);

  useEffect(() => {
    if (embed && a && qr) {
      const t = setTimeout(() => window.print(), 150);
      return () => clearTimeout(t);
    }
  }, [embed, a, qr]);

  if (error) return <p className="p-6 text-destructive">{error}</p>;
  if (!a) return <p className="p-6 text-muted-foreground">Loading badge…</p>;
  const color = ticketColor(a.ticketType);
  const longName = `${a.firstName}`.length > 11;

  return (
    <>
      <style>{`@page { size: 4in 3in; margin: 0; } @media print { html, body { width: 4in; height: 3in; } }`}</style>
      {!embed && (
        <div className="no-print flex justify-center gap-2 p-4">
          <button type="button" className="rounded-full bg-primary px-5 py-2 font-semibold text-primary-foreground" onClick={() => window.print()}>
            Print badge
          </button>
        </div>
      )}
      <article
        data-testid="badge"
        className="mx-auto flex h-[3in] w-[4in] flex-col overflow-hidden bg-white text-[#202124] shadow-lg print:shadow-none"
        aria-label={`Badge for ${a.firstName} ${a.lastName}`}
      >
        <header className="flex items-center justify-between px-[0.2in] pt-[0.15in] text-[10pt] font-semibold tracking-wide uppercase">
          <span>{eventName}</span>
          <span className="flex gap-[3px]" aria-hidden="true">
            {["#4285F4", "#EA4335", "#FBBC04", "#34A853"].map((c) => (
              <span key={c} className="size-[8px] rounded-full" style={{ background: c }} />
            ))}
          </span>
        </header>
        <div className="flex flex-1 items-center gap-[0.15in] px-[0.2in]">
          <div className="min-w-0 flex-1">
            <p className={`font-display leading-none font-bold ${longName ? "text-[26pt]" : "text-[34pt]"}`}>{a.firstName}</p>
            <p className="mt-[4pt] truncate text-[15pt] font-medium">{a.lastName}</p>
            {a.company && <p className="mt-[4pt] truncate text-[11pt] text-[#5f6368]">{a.company}</p>}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
          {qr && <img src={qr} alt="" className="size-[0.85in] shrink-0" />}
        </div>
        <footer className="px-[0.2in] py-[0.08in] text-center text-[13pt] font-bold tracking-wider text-white uppercase" style={{ background: color }}>
          {a.ticketType}
        </footer>
      </article>
    </>
  );
}
