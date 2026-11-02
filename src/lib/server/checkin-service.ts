import { randomBytes } from "node:crypto";
import { codeCandidates, codeKey } from "@/lib/codes";
import { clean, mapKey, searchKey, slotKey } from "@/lib/text";
import {
  DEFAULT_CONFIG,
  type Attendee,
  type AttendeeSource,
  type AttendeeView,
  type CheckInResult,
  type CheckinLogEntry,
  type EventConfig,
  type Stats,
} from "@/lib/types";
import type { NormalizedAttendee } from "./bevy";
import type { Data, DocDb, WriteOp } from "./db";

export class CheckinError extends Error {
  constructor(
    public code: "NOT_FOUND" | "INVALID" | "CONFLICT",
    message: string,
  ) {
    super(message);
  }
}

export interface DeskContext {
  desk: string;
  by: string;
}

const P = {
  config: "config/main",
  stats: "stats/main",
  attendee: (id: string) => `attendees/${id}`,
  ticket: (key: string) => `ticketIndex/${key}`,
};

const EMPTY_STATS = (): Stats => ({ total: 0, checkedIn: 0, walkins: 0, badgesPrinted: 0, byType: {}, byDesk: {}, bySlot: {} });

const iso = (d: unknown) => (d ? new Date(d as Date).toISOString() : null);

export function toView(a: Attendee): AttendeeView {
  return {
    id: a.id,
    ticketCode: a.ticketCode,
    firstName: a.firstName,
    lastName: a.lastName,
    email: a.email,
    company: a.company,
    title: a.title,
    ticketType: a.ticketType,
    source: a.source,
    checkedIn: a.checkedIn,
    checkedInAt: iso(a.checkedInAt),
    checkedInBy: a.checkedInBy,
    desk: a.desk,
    badgePrintedAt: iso(a.badgePrintedAt),
  };
}

function asAttendee(id: string, d: Data): Attendee {
  return { id, ...(d as Omit<Attendee, "id">) };
}

const safeId = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 120);

function keys(firstName: string, lastName: string, email: string) {
  return {
    nameKey: searchKey(`${firstName} ${lastName}`),
    lastKey: searchKey(lastName),
    emailKey: email.toLowerCase(),
  };
}

export class CheckinService {
  private statsCache: { stats: Stats; at: number } | null = null;
  private init: Promise<void> | null = null;

  constructor(
    readonly db: DocDb,
    private opts: { statsCacheMs?: number } = {},
  ) {}

  ensureInitialized() {
    this.init ??= this.db
      .runTransaction(async (tx) => {
        const [cfg, stats] = [await tx.get(P.config), await tx.get(P.stats)];
        if (!cfg) tx.set(P.config, { ...DEFAULT_CONFIG });
        if (!stats) tx.set(P.stats, EMPTY_STATS() as unknown as Data);
      })
      .catch((e) => {
        this.init = null;
        throw e;
      });
    return this.init;
  }

  async getConfig(): Promise<EventConfig> {
    await this.ensureInitialized();
    return { ...DEFAULT_CONFIG, ...((await this.db.get(P.config)) as Partial<EventConfig>) };
  }

  async updateConfig(patch: Partial<EventConfig>) {
    await this.db.set(P.config, patch as Data, { merge: true });
    return this.getConfig();
  }

  async get(id: string): Promise<Attendee | null> {
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) return null;
    const d = await this.db.get(P.attendee(id));
    return d ? asAttendee(id, d) : null;
  }

  /** Resolve a scanned/typed ticket code (bare code, id, or URL) to an attendee. */
  async lookupByCode(raw: string): Promise<Attendee | null> {
    for (const key of codeCandidates(raw)) {
      const idx = await this.db.get(P.ticket(key));
      if (idx?.attendeeId) {
        const a = await this.get(idx.attendeeId as string);
        if (a) return a;
      }
    }
    // Fall back to direct attendee ids (e.g. a badge QR encoding the internal id).
    for (const key of codeCandidates(raw)) {
      const a = await this.get(key);
      if (a) return a;
    }
    return null;
  }

  /**
   * Idempotent check-in. The attendee document is read inside a transaction,
   * so when two desks scan the same ticket at the same moment exactly one
   * records the check-in and the other is told "already checked in".
   */
  async checkIn(id: string, ctx: DeskContext): Promise<CheckInResult> {
    await this.ensureInitialized();
    const now = new Date();
    const outcome = await this.db.runTransaction(async (tx) => {
      const d = await tx.get(P.attendee(id));
      if (!d) return { kind: "missing" as const };
      const a = asAttendee(id, d);
      if (a.checkedIn) return { kind: "already" as const, attendee: a };
      const updated: Attendee = { ...a, checkedIn: true, checkedInAt: now, checkedInBy: ctx.by, desk: ctx.desk, updatedAt: now };
      tx.merge(P.attendee(id), { checkedIn: true, checkedInAt: now, checkedInBy: ctx.by, desk: ctx.desk, updatedAt: now });
      tx.set(`checkins/${now.getTime()}-${randomBytes(4).toString("hex")}`, {
        attendeeId: id,
        name: `${a.firstName} ${a.lastName}`.trim(),
        ticketType: a.ticketType,
        action: "checkin",
        desk: ctx.desk,
        by: ctx.by,
        at: now,
      });
      return { kind: "done" as const, attendee: updated };
    });
    if (outcome.kind === "missing") return { status: "not_found", code: id };
    if (outcome.kind === "already") return { status: "already", attendee: toView(outcome.attendee) };
    await this.db.increment(P.stats, {
      checkedIn: 1,
      [`byType.${mapKey(outcome.attendee.ticketType)}.checkedIn`]: 1,
      [`byDesk.${mapKey(ctx.desk)}`]: 1,
      [`bySlot.${slotKey(now)}`]: 1,
    });
    this.statsCache = null;
    return { status: "checked_in", attendee: toView(outcome.attendee) };
  }

  async checkInByCode(raw: string, ctx: DeskContext): Promise<CheckInResult> {
    const a = await this.lookupByCode(raw);
    if (!a) return { status: "not_found", code: clean(raw, 80) };
    return this.checkIn(a.id, ctx);
  }

  async undoCheckIn(id: string, ctx: DeskContext): Promise<AttendeeView> {
    const now = new Date();
    const res = await this.db.runTransaction(async (tx) => {
      const d = await tx.get(P.attendee(id));
      if (!d) throw new CheckinError("NOT_FOUND", "Attendee not found");
      const a = asAttendee(id, d);
      if (!a.checkedIn) return { changed: false, attendee: a };
      tx.merge(P.attendee(id), { checkedIn: false, checkedInAt: null, checkedInBy: null, desk: null, updatedAt: now });
      tx.set(`checkins/${now.getTime()}-${randomBytes(4).toString("hex")}`, {
        attendeeId: id,
        name: `${a.firstName} ${a.lastName}`.trim(),
        ticketType: a.ticketType,
        action: "undo",
        desk: ctx.desk,
        by: ctx.by,
        at: now,
      });
      return { changed: true, attendee: { ...a, checkedIn: false, checkedInAt: null, checkedInBy: null, desk: null }, prevDesk: a.desk };
    });
    if (res.changed) {
      await this.db.increment(P.stats, {
        checkedIn: -1,
        [`byType.${mapKey(res.attendee.ticketType)}.checkedIn`]: -1,
        [`byDesk.${mapKey(res.prevDesk ?? "unknown")}`]: -1,
      });
      this.statsCache = null;
    }
    return toView(res.attendee);
  }

  async markBadgePrinted(id: string) {
    const a = await this.get(id);
    if (!a) throw new CheckinError("NOT_FOUND", "Attendee not found");
    const first = !a.badgePrintedAt;
    await this.db.set(P.attendee(id), { badgePrintedAt: new Date() }, { merge: true });
    if (first) {
      await this.db.increment(P.stats, { badgesPrinted: 1 });
      this.statsCache = null;
    }
  }

  /** Prefix search on full name, last name and email; exact match on ticket code. */
  async search(q: string, limit = 12): Promise<AttendeeView[]> {
    const raw = clean(q, 80);
    const key = searchKey(raw);
    if (key.length < 2) return [];
    const range = (field: string): Promise<{ id: string; data: Data }[]> =>
      this.db.query("attendees", { where: [[field, ">=", key], [field, "<", key + ""]], limit });
    const fields = key.includes("@") ? ["emailKey"] : ["nameKey", "lastKey", "emailKey"];
    const results = (await Promise.all(fields.map(range))).flat();
    const byCode = await this.lookupByCode(raw);
    const seen = new Map<string, Attendee>();
    if (byCode) seen.set(byCode.id, byCode);
    for (const r of results) if (!seen.has(r.id)) seen.set(r.id, asAttendee(r.id, r.data));
    return [...seen.values()]
      .sort((a, b) => Number(a.checkedIn) - Number(b.checkedIn) || a.nameKey.localeCompare(b.nameKey))
      .slice(0, limit)
      .map(toView);
  }

  /** Insert or update attendees from Bevy / demo data, preserving local check-in state. */
  async upsertAttendees(list: NormalizedAttendee[], source: AttendeeSource): Promise<{ created: number; updated: number }> {
    await this.ensureInitialized();
    const now = new Date();
    let created = 0;
    let updated = 0;
    const ops: WriteOp[] = [];
    const seenCodes = new Set<string>();
    for (const n of list) {
      const id = safeId(source === "bevy" ? `bevy-${n.bevyId}` : n.bevyId);
      const existing = await this.db.get(P.attendee(id));
      const firstName = clean(n.firstName, 60);
      const lastName = clean(n.lastName, 60);
      const email = clean(n.email, 120).toLowerCase();
      const base = {
        ticketCode: clean(n.ticketCode, 80),
        firstName,
        lastName,
        email,
        company: clean(n.company, 80),
        title: clean(n.title, 80),
        ticketType: clean(n.ticketType, 40) || "General",
        bevyId: n.bevyId,
        bevyCheckedIn: n.checkedIn,
        ...keys(firstName, lastName, email),
        updatedAt: now,
      };
      if (existing) {
        updated++;
        ops.push({ path: P.attendee(id), data: base, merge: true });
      } else {
        created++;
        ops.push({
          path: P.attendee(id),
          data: { ...base, source, checkedIn: false, checkedInAt: null, checkedInBy: null, desk: null, badgePrintedAt: null, createdAt: now },
        });
      }
      const ck = codeKey(base.ticketCode);
      if (ck && !seenCodes.has(ck)) {
        seenCodes.add(ck);
        ops.push({ path: P.ticket(ck), data: { attendeeId: id } });
      }
    }
    await this.db.writeBatch(ops);
    await this.recountStats();
    return { created, updated };
  }

  async createWalkIn(
    input: { firstName: string; lastName: string; email: string; company?: string; ticketType?: string },
    ctx: DeskContext,
    checkInNow: boolean,
  ): Promise<{ attendee: AttendeeView; result?: CheckInResult }> {
    await this.ensureInitialized();
    const firstName = clean(input.firstName, 60);
    const lastName = clean(input.lastName, 60);
    const email = clean(input.email, 120).toLowerCase();
    if (!firstName) throw new CheckinError("INVALID", "First name is required");
    if (email) {
      const dupes = await this.db.query("attendees", { where: [["emailKey", "==", email]], limit: 1 });
      if (dupes.length) throw new CheckinError("CONFLICT", "Someone with this email is already registered — search for them instead");
    }
    const id = `walk-${randomBytes(5).toString("hex")}`;
    const ticketCode = `WALK-${randomBytes(3).toString("hex").toUpperCase()}`;
    const now = new Date();
    const ticketType = clean(input.ticketType ?? "", 40) || "Walk-in";
    const a: Omit<Attendee, "id"> = {
      ticketCode,
      firstName,
      lastName,
      email,
      company: clean(input.company ?? "", 80),
      title: "",
      ticketType,
      source: "walkin",
      bevyId: null,
      checkedIn: false,
      checkedInAt: null,
      checkedInBy: null,
      desk: null,
      badgePrintedAt: null,
      bevyCheckedIn: false,
      ...keys(firstName, lastName, email),
      createdAt: now,
      updatedAt: now,
    };
    await this.db.writeBatch([
      { path: P.attendee(id), data: a as unknown as Data },
      { path: P.ticket(codeKey(ticketCode)), data: { attendeeId: id } },
    ]);
    await this.db.increment(P.stats, { total: 1, walkins: 1, [`byType.${mapKey(ticketType)}.total`]: 1 });
    this.statsCache = null;
    const result = checkInNow ? await this.checkIn(id, ctx) : undefined;
    const fresh = (await this.get(id))!;
    return { attendee: toView(fresh), result };
  }

  async recentCheckins(limit = 15): Promise<CheckinLogEntry[]> {
    const rows = await this.db.query("checkins", { orderBy: ["at", "desc"], limit });
    return rows.map(({ id, data }) => ({
      id,
      attendeeId: data.attendeeId as string,
      name: data.name as string,
      ticketType: data.ticketType as string,
      action: data.action as "checkin" | "undo",
      desk: data.desk as string,
      by: data.by as string,
      at: new Date(data.at as Date).toISOString(),
    }));
  }

  async getStats(): Promise<Stats> {
    const ttl = this.opts.statsCacheMs ?? 1500;
    if (this.statsCache && Date.now() - this.statsCache.at < ttl) return this.statsCache.stats;
    await this.ensureInitialized();
    const stats = { ...EMPTY_STATS(), ...((await this.db.get(P.stats)) as Partial<Stats>) };
    this.statsCache = { stats, at: Date.now() };
    return stats;
  }

  /** Rebuild stats from source documents (after bulk imports, or to reconcile). */
  async recountStats(): Promise<Stats> {
    const all = await this.db.query("attendees");
    const s = EMPTY_STATS();
    for (const { data } of all) {
      const a = data as unknown as Attendee;
      const t = mapKey(a.ticketType);
      s.total++;
      s.byType[t] ??= { total: 0, checkedIn: 0 };
      s.byType[t].total++;
      if (a.source === "walkin") s.walkins++;
      if (a.badgePrintedAt) s.badgesPrinted++;
      if (a.checkedIn) {
        s.checkedIn++;
        s.byType[t].checkedIn++;
        const dk = mapKey(a.desk ?? "unknown");
        s.byDesk[dk] = (s.byDesk[dk] ?? 0) + 1;
        if (a.checkedInAt) {
          const sk = slotKey(new Date(a.checkedInAt));
          s.bySlot[sk] = (s.bySlot[sk] ?? 0) + 1;
        }
      }
    }
    await this.db.set(P.stats, s as unknown as Data);
    this.statsCache = null;
    return s;
  }

  async listAll(filter: { checkedIn?: boolean } = {}): Promise<AttendeeView[]> {
    const rows = await this.db.query("attendees", {
      where: filter.checkedIn === undefined ? [] : [["checkedIn", "==", filter.checkedIn]],
      orderBy: ["nameKey", "asc"],
      limit: 10_000,
    });
    return rows.map(({ id, data }) => toView(asAttendee(id, data)));
  }

  async resetAll() {
    const ops: WriteOp[] = [];
    for (const col of ["attendees", "ticketIndex", "checkins"]) {
      for (const id of await this.db.listIds(col)) ops.push({ path: `${col}/${id}`, data: null });
    }
    await this.db.writeBatch(ops);
    await this.db.set(P.stats, EMPTY_STATS() as unknown as Data);
    await this.db.set(P.config, { lastSyncAt: null, lastSyncCount: null, lastSyncError: null }, { merge: true });
    this.statsCache = null;
  }
}
