/**
 * Small CSV reader for attendee exports: handles quoted fields, "" escapes,
 * commas/newlines inside quotes, CRLF line endings and a leading BOM.
 * Semicolon- or tab-separated files (spreadsheet exports in some locales)
 * are detected from the header line.
 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const sep = [",", ";", "\t"].reduce((best, ch) => (count(ch) > count(best) ? ch : best), ",");

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === sep) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

/** "First Name" / "first-name" / "FIRST_NAME" → "first_name". */
export const headerKey = (h: string) =>
  h
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

/** CSV text → one object per data row, keyed by normalised header. */
export function csvRecords(text: string): { headers: string[]; records: Record<string, string>[] } {
  const [head, ...body] = parseCsv(text);
  if (!head) return { headers: [], records: [] };
  const keys = head.map(headerKey);
  const records = body.map((r) => {
    const rec: Record<string, string> = {};
    keys.forEach((k, i) => {
      if (k && !(k in rec)) rec[k] = (r[i] ?? "").trim();
    });
    return rec;
  });
  return { headers: head.map((h) => h.trim()), records };
}
