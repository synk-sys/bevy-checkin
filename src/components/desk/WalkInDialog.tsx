"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, api } from "@/lib/client/api";
import type { AttendeeView, CheckInResult } from "@/lib/types";

const TYPES = ["Walk-in", "General", "Student", "Speaker", "Volunteer", "Sponsor"];

export function WalkInDialog({
  open,
  onOpenChange,
  onDone,
  initialName = "",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: (r: CheckInResult) => void;
  initialName?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ attendee: AttendeeView; result?: CheckInResult }>("/api/walkins", {
        method: "POST",
        body: JSON.stringify({
          firstName: String(f.get("firstName") ?? ""),
          lastName: String(f.get("lastName") ?? ""),
          email: String(f.get("email") ?? ""),
          company: String(f.get("company") ?? ""),
          ticketType: String(f.get("ticketType") ?? "Walk-in"),
          checkInNow: true,
        }),
      });
      onDone(res.result ?? { status: "checked_in", attendee: res.attendee });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not register walk-in");
    } finally {
      setBusy(false);
    }
  };

  const [first, ...rest] = initialName.trim().split(" ");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Register a walk-in</DialogTitle>
        <DialogDescription>Creates a local ticket and checks them in right away.</DialogDescription>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2" key={initialName}>
          <div className="space-y-1.5">
            <Label htmlFor="w-first">First name</Label>
            <Input id="w-first" name="firstName" required maxLength={60} defaultValue={first ?? ""} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="w-last">Last name</Label>
            <Input id="w-last" name="lastName" maxLength={60} defaultValue={rest.join(" ")} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="w-email">Email (optional)</Label>
            <Input id="w-email" name="email" type="email" maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="w-company">Company / school</Label>
            <Input id="w-company" name="company" maxLength={80} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="w-type">Ticket type</Label>
            <select id="w-type" name="ticketType" className="h-11 w-full rounded-xl border border-input bg-card px-3">
              {TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive sm:col-span-2">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy} className="sm:col-span-2">
            {busy && <Loader2 className="animate-spin" />} Register & check in
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
