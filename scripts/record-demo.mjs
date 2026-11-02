// Records the working rehearsal in real time. No fabricated frames or game inputs.
// Usage: npm start (separate terminal), then node scripts/record-demo.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";
const origin = process.env.RECORD_URL || "http://localhost:3001";
fs.mkdirSync("artifacts/demo/raw", { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  recordVideo: {
    dir: "artifacts/demo/raw",
    size: { width: 1920, height: 1080 },
  },
});
const page = await context.newPage();
let phase = "ready";
let pulses = 0;
page.on("websocket", (ws) =>
  ws.on("framereceived", (event) => {
    try {
      const s = JSON.parse(String(event.payload));
      if (s.type === "state") {
        phase = s.game.phase;
        pulses = s.game.bursts;
      }
    } catch {}
  }),
);
page.on("pageerror", (e) => console.error("Browser error:", e.message));
await page.goto(origin);
await page.waitForSelector("canvas");
await page.evaluate(() => document.fonts.ready);
if (
  await page
    .getByRole("button", { name: "Reset mission", exact: true })
    .isEnabled()
)
  await page
    .getByRole("button", { name: "Reset mission", exact: true })
    .click();
await page.getByRole("button", { name: "Rehearsal", exact: true }).click();
await page.getByLabel("Simulated crew", { exact: true }).check();
await page.getByLabel("Training pilot", { exact: true }).check();
await page.evaluate(() => scrollTo(0, 0));
console.log("Recording ready screen");
await page.waitForTimeout(6000);
await page.getByRole("button", { name: "Launch rescue" }).click();
await page.waitForTimeout(6500);
await page.goto(origin + "/overlay");
await page.waitForSelector("canvas");
console.log("Recording real-time flight, source label remains visible");
const started = Date.now();
let shot = false;
while (phase !== "won" && phase !== "lost") {
  await page.waitForTimeout(500);
  if (!shot && pulses > 0) {
    await page.screenshot({ path: "docs/screen-all-hands.png" });
    shot = true;
    console.log("Captured ALL HANDS pulse");
  }
  if (Date.now() - started > 145000)
    throw new Error("Mission exceeded recording timeout");
}
console.log("Recorded mission result:", phase);
await page.waitForTimeout(9000);
await page.goto(origin);
await page.waitForSelector("canvas");
await page.getByRole("button", { name: "Connect Twitch", exact: true }).click();
console.log("Recording truthful connection setup screen");
await page.waitForTimeout(11000);
await page.getByRole("button", { name: "Close dialog" }).click();
await page.goto(origin + "/overlay");
await page.waitForSelector("canvas");
await page.waitForTimeout(10000);
const video = page.video();
await context.close();
await video.saveAs("artifacts/demo/last-signal-rehearsal-raw.webm");
await browser.close();
console.log("Saved artifacts/demo/last-signal-rehearsal-raw.webm");
