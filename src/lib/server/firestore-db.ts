import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import type { Data, DocDb, QueryOptions, Tx, WriteOp } from "./db";

/** Convert Firestore Timestamps back to Dates so the service sees plain values. */
function fromFirestore(data: FirebaseFirestore.DocumentData | undefined): Data | null {
  if (!data) return null;
  const out: Data = {};
  for (const [k, v] of Object.entries(data)) out[k] = v instanceof Timestamp ? v.toDate() : v;
  return out;
}

export class FirestoreDb implements DocDb {
  readonly kind = "firestore" as const;
  constructor(private fs: Firestore) {}

  runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.fs.runTransaction(
      async (t) =>
        fn({
          get: async (path) => fromFirestore((await t.get(this.fs.doc(path))).data()),
          set: (path, data) => void t.set(this.fs.doc(path), data),
          merge: (path, data) => void t.set(this.fs.doc(path), data, { merge: true }),
        }),
      { maxAttempts: 10 },
    );
  }

  async get(path: string) {
    return fromFirestore((await this.fs.doc(path).get()).data());
  }

  async set(path: string, data: Data, opts?: { merge?: boolean }) {
    await this.fs.doc(path).set(data, { merge: !!opts?.merge });
  }

  async increment(path: string, deltas: Record<string, number>, extra: Data = {}) {
    // update() interprets dotted keys as nested map paths; make sure the doc exists first.
    const ref = this.fs.doc(path);
    const update: Record<string, unknown> = { ...extra };
    for (const [k, d] of Object.entries(deltas)) update[k] = FieldValue.increment(d);
    try {
      await ref.update(update);
    } catch (e) {
      if ((e as { code?: number }).code !== 5) throw e; // 5 = NOT_FOUND
      await ref.set({}, { merge: true });
      await ref.update(update);
    }
  }

  async query(collection: string, opts: QueryOptions = {}) {
    let q: FirebaseFirestore.Query = this.fs.collection(collection);
    for (const [field, op, value] of opts.where ?? []) q = q.where(field, op, value);
    if (opts.orderBy) q = q.orderBy(opts.orderBy[0], opts.orderBy[1]);
    if (opts.limit) q = q.limit(opts.limit);
    const snap = await q.get();
    return snap.docs.map((d) => ({ id: d.id, data: fromFirestore(d.data())! }));
  }

  async writeBatch(ops: WriteOp[]) {
    for (let i = 0; i < ops.length; i += 450) {
      const batch = this.fs.batch();
      for (const op of ops.slice(i, i + 450)) {
        const ref = this.fs.doc(op.path);
        if (op.data === null) batch.delete(ref);
        else batch.set(ref, op.data, { merge: !!op.merge });
      }
      await batch.commit();
    }
  }

  async listIds(collection: string) {
    const refs = await this.fs.collection(collection).listDocuments();
    return refs.map((r) => r.id);
  }
}
