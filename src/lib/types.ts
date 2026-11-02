export type AttendeeSource = "bevy" | "demo" | "walkin";
export type Role = "staff" | "admin";

/** attendees/{id} — personal data; readable only through authenticated server routes. */
export interface Attendee {
  id: string;
  ticketCode: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  title: string;
  ticketType: string;
  source: AttendeeSource;
  bevyId: string | null;
  checkedIn: boolean;
  checkedInAt: Date | null;
  checkedInBy: string | null;
  desk: string | null;
  badgePrintedAt: Date | null;
  /** Check-in state last reported by Bevy (informational; local state is authoritative). */
  bevyCheckedIn: boolean;
  nameKey: string;
  lastKey: string;
  emailKey: string;
  createdAt: Date;
  updatedAt: Date;
}

/** JSON-safe attendee sent to staff clients. */
export interface AttendeeView {
  id: string;
  ticketCode: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  title: string;
  ticketType: string;
  source: AttendeeSource;
  checkedIn: boolean;
  checkedInAt: string | null;
  checkedInBy: string | null;
  desk: string | null;
  badgePrintedAt: string | null;
}

export type CheckInResult =
  | { status: "checked_in"; attendee: AttendeeView }
  | { status: "already"; attendee: AttendeeView }
  | { status: "not_found"; code: string };

export interface CheckinLogEntry {
  id: string;
  attendeeId: string;
  name: string;
  ticketType: string;
  action: "checkin" | "undo";
  desk: string;
  by: string;
  at: string;
}

export interface EventConfig {
  eventName: string;
  autoPrintBadge: boolean;
  lastSyncAt: string | null;
  lastSyncCount: number | null;
  lastSyncError: string | null;
}

export interface Stats {
  total: number;
  checkedIn: number;
  walkins: number;
  badgesPrinted: number;
  byType: Record<string, { total: number; checkedIn: number }>;
  byDesk: Record<string, number>;
  /** Check-ins per 10-minute slot, keyed "YYYYMMDD-HHMM" (UTC). */
  bySlot: Record<string, number>;
}

export interface Session {
  role: Role;
  name: string;
}

export const DEFAULT_CONFIG: EventConfig = {
  eventName: process.env.NEXT_PUBLIC_EVENT_NAME || "DevFest Toronto 2026",
  autoPrintBadge: false,
  lastSyncAt: null,
  lastSyncCount: null,
  lastSyncError: null,
};

export const TICKET_COLORS: Record<string, string> = {
  general: "#4285F4",
  student: "#34A853",
  speaker: "#EA4335",
  volunteer: "#FBBC04",
  sponsor: "#9334E6",
  organizer: "#202124",
  "walk-in": "#00897B",
};

export function ticketColor(type: string) {
  const k = type.toLowerCase();
  for (const [name, color] of Object.entries(TICKET_COLORS)) if (k.includes(name)) return color;
  return "#5F6368";
}
