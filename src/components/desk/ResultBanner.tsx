"use client";

import { CheckCircle2, AlertTriangle, XCircle, Printer, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CheckInResult } from "@/lib/types";
import { ticketColor } from "@/lib/types";
import { cn } from "@/lib/utils";

const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");

export function ResultBanner({
  result,
  onPrint,
  onWalkIn,
}: {
  result: CheckInResult;
  onPrint: (id: string) => void;
  onWalkIn: () => void;
}) {
  if (result.status === "not_found") {
    return (
      <div role="alert" data-testid="result" data-status="not_found" className="flex flex-wrap items-center gap-4 rounded-2xl border-2 border-red-300 bg-red-50 p-5">
        <XCircle className="size-10 shrink-0 text-red-600" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-2xl font-bold text-red-800">No ticket found</p>
          <p className="break-all text-red-900/80">“{result.code}” — try searching by name or email, or register a walk-in.</p>
        </div>
        <Button variant="outline" onClick={onWalkIn}>
          <UserPlus /> Walk-in
        </Button>
      </div>
    );
  }
  const a = result.attendee;
  const ok = result.status === "checked_in";
  return (
    <div
      role="status"
      aria-live="assertive"
      data-testid="result"
      data-status={result.status}
      className={cn(
        "flex flex-wrap items-center gap-4 rounded-2xl border-2 p-5",
        ok ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50",
      )}
    >
      {ok ? (
        <CheckCircle2 className="size-12 shrink-0 text-emerald-600" aria-hidden="true" />
      ) : (
        <AlertTriangle className="size-12 shrink-0 text-amber-600" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <p className={cn("font-display text-3xl font-bold", ok ? "text-emerald-900" : "text-amber-900")}>
          {ok ? `Welcome, ${a.firstName}!` : `${a.firstName} is already checked in`}
        </p>
        <p className="text-lg">
          {a.firstName} {a.lastName}
          {a.company && <span className="text-muted-foreground"> · {a.company}</span>}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full px-2.5 py-0.5 font-semibold text-white" style={{ background: ticketColor(a.ticketType) }}>
            {a.ticketType}
          </span>
          {!ok && (
            <span className="text-amber-900">
              at {time(a.checkedInAt)} · {a.desk} · by {a.checkedInBy}
            </span>
          )}
        </p>
      </div>
      <Button size="lg" variant={ok ? "default" : "outline"} onClick={() => onPrint(a.id)} data-testid="print-badge">
        <Printer /> {a.badgePrintedAt ? "Reprint badge" : "Print badge"}
      </Button>
    </div>
  );
}
