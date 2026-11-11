/**
 * Sliding-window rate limiter (per server instance). Database transactions
 * remain the source of truth for "one check-in per ticket"; this layer just
 * absorbs abuse and accidental retry storms cheaply.
 */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  private lastSweep = Date.now();

  constructor(
    private limit: number,
    private windowMs: number,
  ) {}

  check(key: string, now = Date.now()): { ok: boolean; retryAfterSec: number } {
    this.sweep(now);
    const since = now - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (list.length >= this.limit) {
      this.hits.set(key, list);
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil((list[0] + this.windowMs - now) / 1000)) };
    }
    list.push(now);
    this.hits.set(key, list);
    return { ok: true, retryAfterSec: 0 };
  }

  private sweep(now: number) {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [k, v] of this.hits) if (!v.some((t) => t > now - this.windowMs)) this.hits.delete(k);
  }
}

// Conference Wi-Fi puts hundreds of attendees behind one NAT address, so the
// per-IP budget is generous; the per-participant budget is strict.
export const limiters = {
  submitPerUser: new RateLimiter(6, 60_000),
  submitPerIp: new RateLimiter(150, 60_000),
  sessionPerIp: new RateLimiter(400, 60_000),
  readPerIp: new RateLimiter(2_000, 60_000),
  adminLogin: new RateLimiter(10, 5 * 60_000),
};
