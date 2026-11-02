/**
 * Ticket-code matching. Bevy QR codes and USB scanners can produce a bare
 * code, a registration/order id, or a URL containing one of those, so we
 * derive several candidate keys from whatever was scanned.
 */
export function codeKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 80);
}

const PARAM_NAMES = ["ticket", "ticket_code", "ticketcode", "code", "t", "id", "attendee", "attendee_id", "registration", "order", "qr"];

export function codeCandidates(raw: string): string[] {
  const s = raw.trim().slice(0, 500);
  if (!s) return [];
  const out = new Set<string>();
  const add = (v: string | null | undefined) => {
    const k = v ? codeKey(v) : "";
    if (k.length >= 3) out.add(k);
  };
  add(s);
  if (/^https?:\/\//i.test(s)) {
    try {
      const url = new URL(s);
      for (const p of PARAM_NAMES) add(url.searchParams.get(p));
      const segments = url.pathname.split("/").filter(Boolean);
      add(segments.at(-1));
      add(segments.at(-2));
    } catch {}
  }
  // "PREFIX:CODE" style payloads
  if (s.includes(":") && !/^https?:/i.test(s)) add(s.split(":").pop());
  return [...out];
}
