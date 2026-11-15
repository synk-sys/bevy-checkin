import { expect, request, type APIRequestContext, type Page } from "@playwright/test";

/** Give the page its own client address, so the per-IP login limit doesn't trip across tests. */
let ip = 0;
export async function ownAddress(page: Page) {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.1.0.${++ip}` });
}

/** Each desk's test password, e.g. "Desk 3" → "desk-3-e2e" (see playwright.config.ts). */
export const deskPassword = (desk: string) => `${desk.toLowerCase().replace(/\s+/g, "-")}-e2e`;

/** Volunteers sign in as a desk with that desk's password; admins with their name and password. */
export async function signIn(page: Page, role: "staff" | "admin", desk = "Desk 1") {
  await ownAddress(page);
  // Admins use the admin sign-in page and land on the Admin page; volunteers land on the desk.
  await page.goto(role === "admin" ? "/admin/login" : "/login");
  if (role === "admin") await page.getByLabel("Your name").fill("Ada Admin");
  else await page.getByRole("radio", { name: desk, exact: true }).click();
  await page.getByLabel("Password").fill(role === "admin" ? "admin-e2e" : deskPassword(desk));
  await page.getByRole("button", { name: "Sign in" }).click();
  if (role === "staff") {
    await expect(page.getByTestId("scan-input")).toBeVisible();
  } else {
    await expect(page).toHaveURL(/\/admin$/);
  }
}

/**
 * Admin API calls on a separate signed-in connection, so a test can set up data
 * while its page stays signed in as a volunteer (admins don't use the desk).
 */
async function withAdmin<T>(page: Page, fn: (api: APIRequestContext) => Promise<T>): Promise<T> {
  const baseURL = new URL(page.url()).origin;
  const api = await request.newContext({ baseURL, extraHTTPHeaders: { "x-forwarded-for": `10.1.0.${++ip}` } });
  try {
    const res = await api.post("/api/session", { data: { name: "Ada Admin", password: "admin-e2e", adminOnly: true } });
    expect(res.ok()).toBe(true);
    return await fn(api);
  } finally {
    await api.dispose();
  }
}

/** Reset and load demo attendees through the admin API. */
export async function resetWithDemo(page: Page, count = 60) {
  await withAdmin(page, async (api) => {
    await api.post("/api/admin/maintenance", { data: { action: "reset", confirm: "RESET" } });
    const res = await api.post("/api/admin/sync", { data: { source: "demo", count } });
    expect(res.ok()).toBe(true);
  });
}

export async function uncheckedAttendees(page: Page) {
  return withAdmin(page, async (api) => {
    const res = await api.get("/api/admin/attendees?status=out");
    return (await res.json()).attendees as { id: string; firstName: string; lastName: string; email: string; ticketCode: string }[];
  });
}
