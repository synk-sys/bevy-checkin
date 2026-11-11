import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import { expect, test } from "@playwright/test";
import { demoAttendees } from "../../src/lib/demo";
import { resetWithDemo, signIn } from "./helpers";

/**
 * End-to-end camera test: render a real demo ticket's QR code into a Y4M
 * video and hand it to Chromium as the fake webcam. The desk must decode it
 * and check the attendee in, exactly as when a ticket is held to a camera.
 */
const target = demoAttendees(60)[59];
const W = 640;
const H = 480;

function qrY4m(text: string, file: string) {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const scale = Math.floor(300 / (n + 8));
  const size = (n + 8) * scale;
  const ox = (W - size) / 2;
  const oy = (H - size) / 2;
  const y = Buffer.alloc(W * H, 235);
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      if (!qr.modules.get(r, c)) continue;
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) y[(oy + (r + 4) * scale + dy) * W + ox + (c + 4) * scale + dx] = 16;
    }
  const chroma = Buffer.alloc((W / 2) * (H / 2) * 2, 128);
  const frame = Buffer.concat([Buffer.from("FRAME\n"), y, chroma]);
  const frames = Array.from({ length: 30 }, () => frame);
  writeFileSync(file, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F15:1 Ip A1:1 C420jpeg\n`), ...frames]));
}

const dir = path.join(process.cwd(), "test-results");
mkdirSync(dir, { recursive: true });
const video = path.join(dir, "ticket-qr.y4m");
qrY4m(target.ticketCode, video);

test.use({
  launchOptions: {
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${video}`],
  },
});

test("holding a ticket QR up to the camera checks the attendee in", async ({ page }) => {
  await signIn(page, "staff", "Camera Desk");
  await resetWithDemo(page, 60);
  await page.getByTestId("camera-toggle").click();
  const result = page.getByTestId("result");
  await expect(result).toHaveAttribute("data-status", "checked_in", { timeout: 20_000 });
  await expect(result).toContainText(`Welcome, ${target.firstName}!`);
  // A successful check-in closes the camera, so the same QR can't be submitted again.
  await expect(page.locator("video")).toHaveCount(0);
  await expect(page.getByTestId("camera-toggle")).toHaveText(/Camera scan/);
  await page.waitForTimeout(1500);
  await expect(result).toHaveAttribute("data-status", "checked_in");
  // Scanning the same ticket again shows "already checked in" and closes the camera too.
  await page.getByTestId("camera-toggle").click();
  await expect(result).toHaveAttribute("data-status", "already", { timeout: 20_000 });
  await expect(page.locator("video")).toHaveCount(0);
});
