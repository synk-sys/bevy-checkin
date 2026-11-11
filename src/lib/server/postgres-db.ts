import postgres, { type Sql, type TransactionSql } from "postgres";
import { TransactionAbortedError, applyIncrements, type Data, type DocDb, type QueryOptions, type Tx, type WriteOp } from "./db";

/**
 * DocDb on Postgres (Supabase). Every document is one row of `checkin_docs`:
 * (collection, id, data jsonb). Transaction reads lock the row (FOR UPDATE),
 * so a second desk scanning the same ticket waits for the first to commit and
 * then sees "already checked in". Waiting rather than failing keeps busy rows
 * like the stats counter working under a burst at the door.
 */

const TABLE = "checkin_docs";
const RETRYABLE = new Set(["40001", "40P01"]); // serialization failure, deadlock
const MAX_ATTEMPTS = 10;
const CHUNK = 500;

type Q = Sql | TransactionSql;

/** A JSON parameter; Postgres.js serializes it (Dates become ISO strings, undefined fields are dropped). */
const json = (sql: Q, v: unknown) => sql.json(v as postgres.JSONValue);

function split(path: string): [collection: string, id: string] {
  const i = path.indexOf("/");
  return [path.slice(0, i), path.slice(i + 1)];
}

async function upsert(sql: Q, path: string, data: Data, merge: boolean) {
  const [collection, id] = split(path);
  await sql`
    insert into ${sql(TABLE)} (collection, id, data) values (${collection}, ${id}, ${json(sql, data)}::jsonb)
    on conflict (collection, id) do update set data = ${merge ? sql`${sql(TABLE)}.data || excluded.data` : sql`excluded.data`}`;
}

/** Collapse ops on the same path into one, so each path is written once per batch. */
function collapse(ops: WriteOp[]): WriteOp[] {
  const out = new Map<string, WriteOp>();
  for (const op of ops) {
    const prev = out.get(op.path);
    if (!op.merge || op.data === null || !prev) out.set(op.path, { ...op });
    else if (prev.data === null) out.set(op.path, { path: op.path, data: op.data });
    else out.set(op.path, { path: op.path, data: { ...prev.data, ...op.data }, merge: prev.merge });
  }
  return [...out.values()];
}

export class PostgresDb implements DocDb {
  readonly kind = "postgres" as const;
  private ready: Promise<void> | null = null;

  constructor(private sql: Sql) {}

  /** Create the table on first use. Row level security with no policies keeps it out of Supabase's public API. */
  private ensureTable() {
    this.ready ??= (async () => {
      try {
        await this.sql`create table if not exists ${this.sql(TABLE)} (
          collection text not null,
          id text not null,
          data jsonb not null,
          primary key (collection, id)
        )`;
        await this.sql`alter table ${this.sql(TABLE)} enable row level security`;
      } catch (e) {
        // Another instance created it at the same moment.
        if (!["42P07", "23505"].includes((e as { code?: string }).code ?? "")) throw e;
      }
    })().catch((e) => {
      this.ready = null;
      throw e;
    });
    return this.ready;
  }

  async runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    await this.ensureTable();
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        return (await this.sql.begin(async (sql) => {
          const writes = new Map<string, { data: Data; merge: boolean }>();
          let writing = false;
          const tx: Tx = {
            get: async (path) => {
              if (writing) throw new Error("Transactions must do all reads before writes");
              const [collection, id] = split(path);
              const [row] = await sql`select data from ${sql(TABLE)} where collection = ${collection} and id = ${id} for update`;
              return (row?.data as Data) ?? null;
            },
            set: (path, data) => {
              writing = true;
              writes.set(path, { data, merge: false });
            },
            merge: (path, data) => {
              writing = true;
              const prev = writes.get(path);
              if (prev) prev.data = { ...prev.data, ...data };
              else writes.set(path, { data, merge: true });
            },
          };
          const result = await fn(tx);
          for (const [path, w] of writes) await upsert(sql, path, w.data, w.merge);
          return result;
        })) as T;
      } catch (e) {
        if (!RETRYABLE.has((e as { code?: string }).code ?? "")) throw e;
        await new Promise((r) => setTimeout(r, Math.random() * 10 * (attempt + 1)));
      }
    }
    throw new TransactionAbortedError();
  }

  async get(path: string) {
    await this.ensureTable();
    const [collection, id] = split(path);
    const [row] = await this.sql`select data from ${this.sql(TABLE)} where collection = ${collection} and id = ${id}`;
    return (row?.data as Data) ?? null;
  }

  async set(path: string, data: Data, opts?: { merge?: boolean }) {
    await this.ensureTable();
    await upsert(this.sql, path, data, !!opts?.merge);
  }

  async increment(path: string, deltas: Record<string, number>, extra: Data = {}) {
    // Make sure the row exists, so the transaction's read can lock it.
    const [collection, id] = split(path);
    await this.ensureTable();
    await this.sql`insert into ${this.sql(TABLE)} (collection, id, data) values (${collection}, ${id}, '{}'::jsonb) on conflict do nothing`;
    await this.runTransaction(async (tx) => {
      tx.set(path, { ...applyIncrements((await tx.get(path)) ?? {}, deltas), ...extra });
    });
  }

  /** Range filters and ordering compare fields as text in byte order, matching JavaScript string order. */
  async query(collection: string, opts: QueryOptions = {}) {
    await this.ensureTable();
    const sql = this.sql;
    const text = (field: string) => sql`(data ->> ${field}::text) collate "C"`;
    let where = sql`collection = ${collection}`;
    for (const [field, op, value] of opts.where ?? []) {
      const cond =
        op === "==" ? sql`data -> ${field}::text = ${json(sql, value)}::jsonb` : op === ">=" ? sql`${text(field)} >= ${String(value)}` : sql`${text(field)} < ${String(value)}`;
      where = sql`${where} and ${cond}`;
    }
    const order = opts.orderBy ? sql`order by ${text(opts.orderBy[0])} ${opts.orderBy[1] === "desc" ? sql`desc` : sql`asc`}, id` : sql``;
    const limit = opts.limit ? sql`limit ${opts.limit}` : sql``;
    const rows = await sql`select id, data from ${sql(TABLE)} where ${where} ${order} ${limit}`;
    return rows.map((r) => ({ id: r.id as string, data: r.data as Data }));
  }

  async writeBatch(ops: WriteOp[]) {
    if (!ops.length) return;
    await this.ensureTable();
    const final = collapse(ops);
    const rows = (pick: (op: WriteOp) => boolean) =>
      final.filter(pick).map((op) => {
        const [collection, id] = split(op.path);
        return { collection, id, data: op.data };
      });
    const deletes = rows((op) => op.data === null);
    const sets = rows((op) => op.data !== null && !op.merge);
    const merges = rows((op) => op.data !== null && !!op.merge);
    await this.sql.begin(async (sql) => {
      for (let i = 0; i < deletes.length; i += CHUNK) {
        await sql`
          delete from ${sql(TABLE)} d
          using jsonb_to_recordset(${json(sql, deletes.slice(i, i + CHUNK))}::jsonb) as x(collection text, id text)
          where d.collection = x.collection and d.id = x.id`;
      }
      for (const [list, merge] of [[sets, false], [merges, true]] as const) {
        for (let i = 0; i < list.length; i += CHUNK) {
          await sql`
            insert into ${sql(TABLE)} (collection, id, data)
            select collection, id, data from jsonb_to_recordset(${json(sql, list.slice(i, i + CHUNK))}::jsonb) as x(collection text, id text, data jsonb)
            on conflict (collection, id) do update set data = ${merge ? sql`${sql(TABLE)}.data || excluded.data` : sql`excluded.data`}`;
        }
      }
    });
  }

  async listIds(collection: string) {
    await this.ensureTable();
    const rows = await this.sql`select id from ${this.sql(TABLE)} where collection = ${collection}`;
    return rows.map((r) => r.id as string);
  }
}

/**
 * Connect with Supabase's connection string. Through the pooler (port 6543,
 * transaction mode) prepared statements and pipelining must be off.
 * Remote databases use TLS unless the URL sets its own sslmode.
 */
export function createPostgresDb(url: string) {
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  return new PostgresDb(
    postgres(url, {
      prepare: false,
      max_pipeline: 1,
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      query_timeout: 20,
      onnotice: () => {},
      ...(local || /[?&]sslmode=/.test(url) ? {} : { ssl: "require" as const }),
    }),
  );
}
