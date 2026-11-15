"use client";

import { CheckCircle2, AlertTriangle, Gift, XCircle, Printer, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CheckInResult } from "@/lib/types";
import { ticketColor } from "@/lib/types";
import { cn } from "@/lib/utils";

const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");

export function ResultBanner({
  result,
  onPrint,
  onWalkIn,
  onSwag,
  onUndoSwag,
  busy = false,
}: {
  result: CheckInResult;
  onPrint: (id: string) => void;
  onWalkIn: () => void;
  onSwag?: (id: string) => void;
  onUndoSwag?: (id: string) => void;
  busy?: boolean;
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
              at {time(a.checkedInAt)} · {a.desk}
              {a.checkedInBy && a.checkedInBy !== a.desk && ` · by ${a.checkedInBy}`}
            </span>
          )}
          {a.swagCollectedAt && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 font-medium text-emerald-800" data-testid="swag-status">
              <Gift className="size-3.5" aria-hidden="true" /> Swag collected {time(a.swagCollectedAt)}
              {a.swagDesk && ` · ${a.swagDesk}`}
              {onUndoSwag && (
                <button type="button" className="ml-1 underline" onClick={() => onUndoSwag(a.id)} disabled={busy}>
                  Undo
                </button>
              )}
            </span>
          )}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {onSwag && !a.swagCollectedAt && (
          <Button size="lg" variant="outline" onClick={() => onSwag(a.id)} disabled={busy} data-testid="swag-button">
            <Gift /> Swag collected
          </Button>
        )}
        <Button size="lg" variant={ok ? "default" : "outline"} onClick={() => onPrint(a.id)} data-testid="print-badge">
          <Printer /> {a.badgePrintedAt ? "Reprint badge" : "Print badge"}
        </Button>
      </div>
    </div>
  );
}
