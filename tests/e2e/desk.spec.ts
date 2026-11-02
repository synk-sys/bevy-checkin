import { expect, test } from "@playwright/test";
import { resetWithDemo, signIn, uncheckedAttendees } from "./helpers";

test.describe.serial("check-in desk", () => {
  test("USB-scanner style code entry checks in once, then warns on repeat", async ({ page }) => {
    await signIn(page, "admin");
    await resetWithDemo(page);
    const [a] = await uncheckedAttendees(page);
    const input = page.getByTestId("scan-input");
    await input.fill(a.ticketCode);
    await input.press("Enter");
    const result = page.getByTestId("result");
    await expect(result).toHaveAttribute("data-status", "checked_in");
    await expect(result).toContainText(`Welcome, ${a.firstName}!`);
    await expect(input).toBeFocused(); // ready for the next scan
    await input.fill(a.ticketCode.toLowerCase());
    await input.press("Enter");
    await expect(result).toHaveAttribute("data-status", "already");
    await expect(result).toContainText("Desk 1");
  });

  test("search by name and check in from results", async ({ page }) => {
    await signIn(page, "admin");
    // Pick someone not yet checked in and search on their (unique) email prefix.
    const [target] = await uncheckedAttendees(page);
    await page.getByTestId("scan-input").fill(target.email.split("@")[0]);
    const row = page.getByTestId("search-results").locator("li", { hasText: target.email });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: /Check in/ }).click();
    await expect(page.getByTestId("result")).toHaveAttribute("data-status", "checked_in");
  });

  test("unknown ticket offers walk-in registration", async ({ page }) => {
    await signIn(page, "staff", "Desk 2");
    const input = page.getByTestId("scan-input");
    await input.fill("ZZ-999999");
    await input.press("Enter");
    await expect(page.getByTestId("result")).toHaveAttribute("data-status", "not_found");
    await page.getByTestId("result").getByRole("button", { name: "Walk-in" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("First name").fill("Wally");
    await dialog.getByLabel("Last name").fill("Walker");
    await dialog.getByRole("button", { name: /Register & check in/ }).click();
    await expect(page.getByTestId("result")).toContainText("Welcome, Wally!");
  });

  test("badge prints at 4x3 inches", async ({ page }) => {
    await signIn(page, "staff");
    const res = await page.request.get("/api/attendees/search?q=wally");
    const { results } = await res.json();
    await page.addInitScript(() => {
      (window as unknown as { __printed: number }).__printed = 0;
      window.print = () => void ((window as unknown as { __printed: number }).__printed += 1);
    });
    await page.goto(`/badge/${results[0].id}?embed=1`);
    const badge = page.getByTestId("badge");
    await expect(badge).toContainText("Wally");
    await expect(badge).toContainText("Walk-in");
    const box = await badge.boundingBox();
    expect(Math.round(box!.width)).toBe(384); // 4in @ 96dpi
    expect(Math.round(box!.height)).toBe(288); // 3in
    await expect.poll(() => page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);
  });

  test("camera scanner starts with a camera available", async ({ page }) => {
    await signIn(page, "staff");
    await page.getByTestId("camera-toggle").click();
    const video = page.locator("video");
    await expect(video).toBeVisible();
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThanOrEqual(2);
    await expect(page.getByText("Camera unavailable")).toHaveCount(0);
  });
});

test("dashboard updates live when another desk checks someone in", async ({ page, browser }) => {
  await signIn(page, "admin");
  await page.goto("/dashboard");
  const stat = page.getByTestId("stat-checked-in");
  await expect(stat).toBeVisible();
  const before = Number(await stat.textContent());

  const other = await browser.newContext();
  const deskPage = await other.newPage();
  await signIn(deskPage, "staff", "Desk 9");
  const [a] = await uncheckedAttendees(page);
  const res = await deskPage.request.post("/api/checkin", { data: { code: a.ticketCode }, headers: { "x-desk": "Desk 9" } });
  expect((await res.json()).status).toBe("checked_in");
  await other.close();

  await expect(stat).toHaveText(String(before + 1), { timeout: 10_000 });
  await expect(page.getByTestId("recent-feed")).toContainText(`${a.firstName} ${a.lastName}`);
});

test("staff cannot reach admin features", async ({ page }) => {
  await signIn(page, "staff");
  await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
  await page.goto("/admin");
  await expect(page.getByText("This page is for admins only.")).toBeVisible();
  expect((await page.request.get("/api/admin/export")).status()).toBe(403);
});

test("signed-out visitors are sent to login and see no attendee data", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  expect((await page.request.get("/api/attendees/search?q=ai")).status()).toBe(401);
});

test("desk works on a phone-sized screen", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await signIn(page, "staff", "Roaming");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await ctx.close();
});
