import { test, expect } from "@playwright/test";
import { request as httpRequest } from "node:http";
import WebSocket from "ws";
import type { Snapshot } from "../../shared/types.js";
// Rehearsal-mode browser journeys. Every viewer here is a labelled SIMULATED viewer entered
// through the console; real Twitch chat is verified manually (see docs/VALIDATION.md).
const port = process.env.E2E_PORT || "3002";
async function watch() {
  const ws = new WebSocket(`ws://localhost:${port}/ws`, {
    origin: `http://localhost:${port}`,
  });
  let latest: Snapshot;
  ws.on("message", (raw) => {
    const data = JSON.parse(raw.toString());
    if (data.type === "state") latest = data;
  });
  await new Promise<void>((resolve) => ws.once("open", () => resolve()));
  return { ws, read: () => latest! };
}
function rawGet(path: string, host: string) {
  return new Promise<number>((resolve, reject) => {
    const req = httpRequest(
      { host: "127.0.0.1", port: Number(port), path, headers: { Host: host } },
      (res) => {
        res.resume();
        resolve(res.statusCode || 0);
      },
    );
    req.on("error", reject);
    req.end();
  });
}

test("lobby boarding, visible rejections, countdown precharge, afterburner and full mission log", async ({
  page,
  request,
}) => {
  const observer = await watch();
  try {
    await page.goto("/");
    await page.getByLabel("Simulated crew", { exact: true }).uncheck();
    const name = page.getByLabel("Simulated viewer name");
    for (const viewer of ["ada_sim", "bo_sim", "cy_sim"]) {
      await name.fill(viewer);
      await page.getByRole("button", { name: "!join", exact: true }).click();
      await expect(page.locator(".lobby-names")).toContainText(viewer);
    }
    expect(new Set(observer.read().game.crew.map((c) => c.role)).size).toBe(3);
    await page.getByRole("button", { name: "!join", exact: true }).click();
    await expect(page.getByRole("log")).toContainText("already aboard");

    await page.getByRole("button", { name: "Launch rescue" }).click();
    await expect.poll(() => observer.read().game.countdown).toBeGreaterThan(0);
    await name.fill("bo_sim");
    await page.getByRole("button", { name: "!boost", exact: true }).click();
    await expect.poll(() => observer.read().game.ship.boost).toBeGreaterThan(10);

    await expect
      .poll(() => observer.read().game.countdown, { timeout: 7000 })
      .toBe(0);
    await page.getByTestId("flight-canvas").focus();
    await page.keyboard.down("d");
    await expect
      .poll(() => observer.read().game.ship.afterburner, { timeout: 6000 })
      .toBeGreaterThan(0.5);
    await page.keyboard.up("d");
    expect(observer.read().game.ship.x).toBeLessThanOrEqual(780);

    const report = await (await request.get("/api/report")).json();
    expect(report.eventCount).toBe(report.events.length);
    expect(
      report.events.filter((e: { type: string }) => e.type === "join"),
    ).toHaveLength(3);
    expect(
      report.events.some((e: { type: string }) => e.type === "rejected"),
    ).toBe(true);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await page.getByRole("button", { name: "Reset mission", exact: true }).click();
  } finally {
    observer.ws.close();
  }
});

test("sound and music controls start the synthesized soundtrack and remember the choice", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Turn on sound & music" }).click();
  const audio = () =>
    page.evaluate(
      () =>
        (globalThis as unknown as { __lastSignalAudio: () => Record<string, unknown> })
          .__lastSignalAudio(),
    );
  await expect.poll(async () => (await audio()).context).toBe("running");
  await page.getByRole("button", { name: "Launch rescue" }).click();
  await expect.poll(async () => (await audio()).mode, { timeout: 8000 }).toBe("flight");
  await expect.poll(async () => (await audio()).sequencer).toBe(true);
  await page.getByRole("button", { name: "Turn music off" }).click();
  await expect.poll(async () => (await audio()).music).toBe(false);
  await page.reload();
  await expect.poll(async () => (await audio()).sound).toBe(true);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Reset mission", exact: true }).click();
});

test("control key, host allowlist and OAuth return stay locked down", async ({
  request,
}) => {
  const cfg = await (await request.get("/api/config")).json();
  expect(cfg.operatorKey).toHaveLength(64);
  expect(await rawGet("/api/config", "attacker.example")).toBe(421);
  expect(await rawGet("/api/config", `localhost:${port}`)).toBe(200);
  const allowed = await request.get(
    `/auth/twitch?return=${encodeURIComponent(`http://localhost:${port}`)}`,
    { maxRedirects: 0 },
  );
  expect(allowed.headers().location).toMatch(
    new RegExp(`^http://localhost:${port}/\\?twitchError=Configure`),
  );
  const hostile = await request.get(
    `/auth/twitch?return=${encodeURIComponent("https://attacker.example")}`,
    { maxRedirects: 0 },
  );
  expect(hostile.headers().location).toMatch(/^\/\?twitchError=Configure/);
});

test("pilot laser, dash and chat gifts and meteors work through the real console", async ({ page }) => {
  const observer = await watch();
  try {
    await page.goto("/");
    await page.getByLabel("Simulated crew", { exact: true }).uncheck();
    await page.getByLabel("Training pilot", { exact: true }).uncheck();
    const name = page.getByLabel("Simulated viewer name");
    await name.fill("fuel_sim");
    await page.getByRole("button", { name: "!boost", exact: true }).click();
    await page.getByRole("button", { name: "Launch rescue" }).click();
    await expect.poll(() => observer.read().game.countdown, { timeout: 7000 }).toBe(0);
    const canvas = page.getByTestId("flight-canvas");
    await canvas.focus();
    await page.keyboard.down(" ");
    await expect.poll(() => observer.read().game.ship.heat, { timeout: 4000 }).toBeGreaterThan(10);
    await page.keyboard.up(" ");
    await page.keyboard.press("Shift");
    await expect.poll(() => observer.read().game.ship.dash, { timeout: 3000 }).toBeGreaterThan(0);
    expect(observer.read().game.ship.boost).toBeLessThan(22);
    await name.fill("gift_sim");
    await page.getByRole("button", { name: "!drop", exact: true }).click();
    await expect.poll(() => observer.read().game.drops.length).toBe(1);
    await name.fill("troll_sim");
    await page.getByRole("button", { name: "!meteor", exact: true }).click();
    await expect.poll(() => observer.read().game.meteors.length).toBe(1);
    await expect(page.getByRole("log")).toContainText("troll_sim");
    await canvas.focus();
    await page.keyboard.press("p");
    await expect(page.getByRole("heading", { name: "Holding position." })).toBeVisible();
    await page.getByRole("button", { name: "Reset mission", exact: true }).click();
  } finally {
    observer.ws.close();
  }
});
