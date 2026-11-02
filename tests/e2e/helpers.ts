import { expect, type Page } from "@playwright/test";

export async function signIn(page: Page, role: "staff" | "admin", desk = "Desk 1", name = role === "admin" ? "Ada Admin" : "Sam Staff") {
  await page.goto("/login");
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Desk name").fill(desk);
  await page.getByLabel("Passcode").fill(role === "admin" ? "admin-e2e" : "staff-e2e");
  await page.getByRole("button", { name: "Sign in" }).click();
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
