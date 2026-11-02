import { test, expect } from "@playwright/test";
import WebSocket from "ws";
import type { Snapshot } from "../../shared/types.js";

const port = process.env.E2E_PORT || "3002";

test("catch a chat crate with keyboard steering, fire it with E, and recover after reload", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const ws = new WebSocket(`ws://localhost:${port}/ws`, { origin: `http://localhost:${port}` });
  let latest!: Snapshot;
  ws.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.type === "state") latest = message;
  });
  await new Promise<void>((resolve) => ws.once("open", () => resolve()));
  try {
    await page.goto("/");
    await page.getByLabel("Simulated crew", { exact: true }).uncheck();
    await page.getByLabel("Training pilot", { exact: true }).uncheck();
    await page.getByRole("button", { name: "Launch rescue" }).click();
    await expect.poll(() => latest.game.phase).toBe("running");
    await expect.poll(() => latest.game.countdown, { timeout: 7000 }).toBe(0);
    await page.getByLabel("Simulated viewer name").fill("catch_test_sim");
    await page.getByRole("button", { name: "!drop", exact: true }).click();
    await expect.poll(() => latest.game.drops.length).toBe(1);
    await page.getByTestId("flight-canvas").focus();
    let held = "";
    await expect.poll(async () => {
      const crate = latest.game.drops[0];
      const difference = crate ? crate.y - latest.game.ship.y : 0;
      const key = Math.abs(difference) < 12 ? "" : difference > 0 ? "s" : "w";
      if (key !== held) {
        if (held) await page.keyboard.up(held);
        if (key) await page.keyboard.down(key);
        held = key;
      }
      return latest.game.ship.powerup?.owner;
    }, { timeout: 15000, intervals: [80] }).toBe("catch_test_sim");
    if (held) await page.keyboard.up(held);
    await page.screenshot({ path: "docs/screen-powerup.png", fullPage: true });
    expect(latest.game.crew.find((c) => c.name === "catch_test_sim")?.points).toBe(25);
    await page.keyboard.press("e");
    await expect.poll(() => latest.game.ship.powerup).toBeNull();
    expect(latest.game.events.some((e) => e.type === "powerup" && e.name === "catch_test_sim")).toBe(true);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Holding position." })).toBeVisible();
    const missionId = latest.game.id;
    await page.reload();
    await expect(page.getByRole("heading", { name: "Holding position." })).toBeVisible();
    expect(latest.game.id).toBe(missionId);
    await page.getByRole("button", { name: "Reset mission", exact: true }).click();
    await expect.poll(() => latest.game.phase).toBe("ready");
    expect(latest.game.drops).toHaveLength(0);
    expect(latest.game.meteors).toHaveLength(0);
    expect(errors).toEqual([]);
    const video = page.video();
    await page.close();
    await video?.saveAs("artifacts/demo/last-signal-gameplay-raw.webm");
  } finally {
    ws.close();
  }
});

test("help, OBS setup and spectator audio work without browser errors", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Source on GitHub", exact: true })).toHaveAttribute("href", "https://github.com/Anas-HK/last-signal");
  await page.getByRole("button", { name: "How to play", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("!drop");
  await expect(page.getByRole("dialog")).toContainText("!meteor");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Add to OBS/ }).click();
  await expect(page.getByLabel("OBS browser source URL")).toHaveValue(`http://localhost:${port}/overlay`);
  await page.keyboard.press("Escape");
  const overlay = await context.newPage();
  overlay.on("pageerror", (error) => errors.push(error.message));
  await overlay.goto("/overlay");
  await expect(overlay.locator("canvas")).toBeVisible();
  const audio = await overlay.evaluate(() => (globalThis as unknown as { __lastSignalAudio: () => { context: string } }).__lastSignalAudio());
  expect(audio.context).not.toBe("running");
  expect(errors).toEqual([]);
  await overlay.close();
});

test("API validation and WebSocket origin checks reject invalid control requests", async ({ request }) => {
  const origin = `http://localhost:${port}`;
  const config = await (await request.get("/api/config")).json();
  const headers = { Origin: origin, "X-Operator-Key": config.operatorKey };
  expect((await request.post("/api/mode", { headers, data: { mode: "unknown" } })).status()).toBe(400);
  expect((await request.post("/api/mode", { headers, data: { mode: "live" } })).status()).toBe(400);
  expect((await request.post("/api/twitch/anonymous", { headers, data: { channel: "bad/channel" } })).status()).toBe(400);
  expect((await request.post("/api/mode", {
    headers: { ...headers, "Content-Type": "application/json" }, data: "{invalid",
  })).status()).toBe(400);
  const rejected = new WebSocket(`ws://localhost:${port}/ws?key=${config.operatorKey}`, { origin: "https://attacker.invalid" });
  const outcome = await new Promise<string>((resolve) => {
    rejected.once("open", () => resolve("opened"));
    rejected.once("error", () => resolve("rejected"));
  });
  rejected.terminate();
  expect(outcome).toBe("rejected");
  expect((await (await request.get("/api/health")).json()).ok).toBe(true);
});
