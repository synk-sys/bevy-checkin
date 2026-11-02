/** Lower-case, accent-free search key: "José Núñez" → "jose nunez". */
export function searchKey(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9@._+\- ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip control characters and collapse whitespace from untrusted text. */
export function clean(s: unknown, max = 120): string {
  if (typeof s !== "string" && typeof s !== "number") return "";
  return String(s)
    .replace(/[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁠-⁯﻿]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Safe map key for Firestore dotted field paths. */
export function mapKey(s: string): string {
  return (s || "unknown").replace(/[.\/~*\[\]`]/g, "_").slice(0, 60) || "unknown";
}

/** UTC 10-minute slot key "YYYYMMDD-HHMM". */
export function slotKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const m = Math.floor(d.getUTCMinutes() / 10) * 10;
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(m)}`;
}
