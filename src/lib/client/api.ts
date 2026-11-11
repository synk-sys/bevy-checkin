"use client";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public body?: unknown,
  ) {
    super(message);
  }
}

const DESK_KEY = "checkin:desk";

export function getDesk(): string {
  try {
    return localStorage.getItem(DESK_KEY) || "Desk 1";
  } catch {
    return "Desk 1";
  }
}

export function setDesk(name: string) {
  try {
    localStorage.setItem(DESK_KEY, name);
  } catch {}
}

/** Fetch wrapper: sends the session cookie + desk header; 404 check-in results are returned, not thrown. */
export async function api<T>(path: string, init: RequestInit & { allow404?: boolean } = {}): Promise<T> {
  const { allow404, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(path, {
      ...rest,
      credentials: "same-origin",
      headers: {
        ...(rest.body ? { "content-type": "application/json" } : {}),
        "x-desk": getDesk(),
        ...(rest.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(0, "NETWORK", "No connection — check the Wi-Fi and try again.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok && !(allow404 && res.status === 404 && !body?.error)) {
    throw new ApiError(res.status, body?.error?.code ?? "ERROR", body?.error?.message ?? "Request failed", body);
  }
  return body as T;
}

export async function downloadAuthed(path: string, filename: string) {
  const res = await fetch(path, { credentials: "same-origin" });
  if (!res.ok) throw new ApiError(res.status, "ERROR", "Download failed");
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
