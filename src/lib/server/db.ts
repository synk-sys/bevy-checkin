/**
 * Minimal document-database abstraction with Firestore semantics.
 *
 * The mosaic service is written once against this interface. In production
 * it is backed by Firestore (firestore-db.ts); for the local prototype, demo
 * rehearsals and tests it is backed by MemoryDb, which implements genuine
 * optimistic-concurrency transactions (read versions are validated at commit
 * and the transaction body is retried on conflict) so concurrency tests
 * exercise the same allocation code path that runs against Firestore.
 */
export type Data = Record<string, unknown>;

export interface Tx {
  get(path: string): Promise<Data | null>;
  set(path: string, data: Data): void;
  /** Shallow merge into an existing document. */
  merge(path: string, data: Data): void;
}

export interface QueryOptions {
  where?: [field: string, op: "==" | ">=" | "<", value: unknown][];
  orderBy?: [field: string, dir: "asc" | "desc"];
  limit?: number;
}

export interface WriteOp {
  path: string;
  data: Data | null; // null = delete
  merge?: boolean;
}

export interface DocDb {
  readonly kind: "memory" | "firestore";
  runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  get(path: string): Promise<Data | null>;
  set(path: string, data: Data, opts?: { merge?: boolean }): Promise<void>;
  /** Atomic numeric increments (merged), creating the document if needed. Dotted keys address nested maps. */
  increment(path: string, deltas: Record<string, number>, extra?: Data): Promise<void>;
  query(collection: string, opts?: QueryOptions): Promise<{ id: string; data: Data }[]>;
  /** Non-transactional batched writes (chunked to the 500-op limit). */
  writeBatch(ops: WriteOp[]): Promise<void>;
  listIds(collection: string): Promise<string[]>;
}

export class TransactionAbortedError extends Error {
  constructor() {
    super("Transaction aborted after too many conflicts");
  }
}

interface Entry {
  data: Data;
  version: number;
}

const clone = <T>(v: T): T => structuredClone(v);

export class MemoryDb implements DocDb {
  readonly kind = "memory" as const;
  private docs = new Map<string, Entry>();
  private versionCounter = 0;
  /** Commit attempts that failed validation — exposed for tests. */
  conflicts = 0;

  constructor(private opts: { jitter?: boolean; maxAttempts?: number } = {}) {}

  private async yieldTick() {
    // Interleave concurrent transactions like real network round-trips would.
    if (this.opts.jitter) await new Promise((r) => setTimeout(r, Math.random() * 3));
    else await Promise.resolve();
  }

  async runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const maxAttempts = this.opts.maxAttempts ?? 25;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const reads = new Map<string, number>(); // path -> version seen (0 = missing)
      const writes = new Map<string, { data: Data; merge: boolean }>();
      let writing = false;
      const tx: Tx = {
        get: async (path) => {
          if (writing) throw new Error("Firestore transactions require all reads before writes");
          await this.yieldTick();
          const e = this.docs.get(path);
          reads.set(path, e?.version ?? 0);
          return e ? clone(e.data) : null;
        },
        set: (path, data) => {
          writing = true;
          writes.set(path, { data: clone(data), merge: false });
        },
        merge: (path, data) => {
          writing = true;
          const prev = writes.get(path);
          if (prev) prev.data = { ...prev.data, ...clone(data) };
          else writes.set(path, { data: clone(data), merge: true });
        },
      };
      const result = await fn(tx);
      await this.yieldTick();
      // Commit: validate every read is still current (atomic — JS is single-threaded here).
      let valid = true;
      for (const [path, version] of reads) {
        if ((this.docs.get(path)?.version ?? 0) !== version) {
          valid = false;
          break;
        }
      }
      if (!valid) {
        this.conflicts++;
        await new Promise((r) => setTimeout(r, Math.random() * 4 * (attempt + 1)));
        continue;
      }
      for (const [path, w] of writes) {
        const base = w.merge ? (this.docs.get(path)?.data ?? {}) : {};
        this.docs.set(path, { data: { ...base, ...w.data }, version: ++this.versionCounter });
      }
      return result;
    }
    throw new TransactionAbortedError();
  }

  async get(path: string) {
    await this.yieldTick();
    const e = this.docs.get(path);
    return e ? clone(e.data) : null;
  }

  async set(path: string, data: Data, opts?: { merge?: boolean }) {
    const base = opts?.merge ? (this.docs.get(path)?.data ?? {}) : {};
    this.docs.set(path, { data: { ...base, ...clone(data) }, version: ++this.versionCounter });
  }

  async increment(path: string, deltas: Record<string, number>, extra: Data = {}) {
    const data = structuredClone(this.docs.get(path)?.data ?? {}) as Data;
    for (const [k, d] of Object.entries(deltas)) {
      const parts = k.split(".");
      let node = data;
      for (const part of parts.slice(0, -1)) node = (node[part] ??= {}) as Data;
      const leaf = parts[parts.length - 1];
      node[leaf] = ((node[leaf] as number) ?? 0) + d;
    }
    this.docs.set(path, { data: { ...data, ...clone(extra) }, version: ++this.versionCounter });
  }

  async query(collection: string, opts: QueryOptions = {}) {
    await this.yieldTick();
    const prefix = collection + "/";
    let rows = [...this.docs.entries()]
      .filter(([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/"))
      .map(([p, e]) => ({ id: p.slice(prefix.length), data: clone(e.data) }));
    for (const [field, op, value] of opts.where ?? []) {
      rows = rows.filter((r) => {
        const v = r.data[field] as string | number;
        if (op === "==") return v === value;
        if (v === undefined || v === null) return false;
        return op === ">=" ? v >= (value as string | number) : v < (value as string | number);
      });
    }
    if (opts.orderBy) {
      const [field, dir] = opts.orderBy;
      const sign = dir === "asc" ? 1 : -1;
      rows.sort((a, b) => {
        const av = a.data[field] as number | string | Date;
        const bv = b.data[field] as number | string | Date;
        return (av < bv ? -1 : av > bv ? 1 : 0) * sign;
      });
    }
    if (opts.limit) rows = rows.slice(0, opts.limit);
    return rows;
  }

  async writeBatch(ops: WriteOp[]) {
    for (const op of ops) {
      if (op.data === null) this.docs.delete(op.path);
      else await this.set(op.path, op.data, { merge: op.merge });
    }
  }

  async listIds(collection: string) {
    return (await this.query(collection)).map((r) => r.id);
  }
}
