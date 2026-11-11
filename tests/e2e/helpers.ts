import { expect, type Page } from "@playwright/test";

/** Give the page its own client address, so the per-IP login limit doesn't trip across tests. */
let ip = 0;
export async function ownAddress(page: Page) {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.1.0.${++ip}` });
}

export async function signIn(page: Page, role: "staff" | "admin", desk = "Desk 1", name = role === "admin" ? "Ada Admin" : "Sam Staff") {
  await ownAddress(page);
  // Admins use the admin sign-in page; land on the desk so every test starts there.
  await page.goto(role === "admin" ? "/admin/login?next=/" : "/login");
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Password").fill(role === "admin" ? "admin-e2e" : "staff-e2e");
  await page.getByRole("button", { name: "Sign in" }).click();
  if (role === "staff") {
    await page.getByLabel("Desk name").fill(desk);
    await page.getByRole("button", { name: "Start" }).click();
  }
  await expect(page.getByTestId("scan-input")).toBeVisible();
}

/** Reset and load demo attendees through the admin API (uses the page's session cookie). */
export async function resetWithDemo(page: Page, count = 60) {
  await page.request.post("/api/admin/maintenance", { data: { action: "reset", confirm: "RESET" } });
  const res = await page.request.post("/api/admin/sync", { data: { source: "demo", count } });
  expect(res.ok()).toBe(true);
}

export async function uncheckedAttendees(page: Page) {
  const res = await page.request.get("/api/admin/attendees?status=out");
  return (await res.json()).attendees as { id: string; firstName: string; lastName: string; email: string; ticketCode: string }[];
}
