import { test, expect } from "@playwright/test";
import WebSocket from "ws";
import type { Snapshot } from "../../shared/types.js";
async function watch() {
  const ws = new WebSocket("ws://localhost:3002/ws", {
    origin: "http://localhost:3002",
  });
  let latest: Snapshot;
  ws.on("message", (raw) => {
    const data = JSON.parse(raw.toString());
    if (data.type === "state") latest = data;
  });
  await new Promise<void>((resolve) => ws.once("open", () => resolve()));
  return { ws, read: () => latest! };
}
test("pilot input, manual viewer action, pause, source separation and spectator permissions", async ({
  page,
  context,
  request,
}) => {
  const observer = await watch();
  try {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "You fly. Chat keeps you alive." }),
    ).toBeVisible();
    await page.screenshot({ path: "docs/screen-ready.png", fullPage: true });
    await page.getByLabel("Simulated crew", { exact: true }).uncheck();
    await page.getByRole("button", { name: "Launch rescue" }).click();
    await expect
      .poll(() => observer.read()?.game.countdown, { timeout: 7000 })
      .toBe(0);
    const before = observer.read().game.ship.y;
    await page.getByTestId("flight-canvas").focus();
    await page.keyboard.down("w");
    await page.waitForTimeout(500);
    await page.keyboard.up("w");
    await expect
      .poll(() => observer.read().game.ship.y)
      .toBeLessThan(before - 30);
    await page.getByLabel("Simulated viewer name").fill("test_captain");
    await page.getByRole("button", { name: "!shield", exact: true }).click();
    await expect
      .poll(() =>
        observer.read().game.crew.some((c) => c.name === "test_captain"),
      )
      .toBe(true);
    await expect(page.getByRole("log")).toContainText("test_captain");
    const overlay = await context.newPage();
    await overlay.setViewportSize({ width: 1920, height: 1080 });
    await overlay.goto("/overlay");
    await expect(
      overlay.getByText("REHEARSAL · SIMULATED CHAT", { exact: true }),
    ).toBeVisible();
    await expect(
      overlay.getByRole("button", { name: "Launch rescue" }),
    ).toHaveCount(0);
    observer.ws.send(JSON.stringify({ type: "action", action: "reset" }));
    await page.waitForTimeout(200);
    expect(observer.read().game.phase).toBe("running");
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Holding position." }),
    ).toBeVisible();
    const position = observer.read().game.distance;
    await page.waitForTimeout(300);
    expect(observer.read().game.distance).toBe(position);
    await page
      .getByRole("button", { name: "Reset mission", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Launch rescue" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Twitch live", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Join live chat" }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toContainText("No keys");
    await page.getByRole("button", { name: "Close dialog" }).click();
    const rejected = await request.post("/api/mode", {
      data: { mode: "live" },
    });
    expect(rejected.status()).toBe(403);
    const cfg = await (await request.get("/api/config")).json();
    const wrongOrigin = await request.post("/api/mode", {
      headers: {
        "X-Operator-Key": cfg.operatorKey,
        Origin: "https://attacker.invalid",
      },
      data: { mode: "demo" },
    });
    expect(wrongOrigin.status()).toBe(403);
    const oauth = await request.get(
      "/auth/twitch/callback?state=bogus&code=fake",
      { maxRedirects: 0 },
    );
    expect(oauth.status()).toBe(302);
    expect(oauth.headers().location).toContain("Sign-in");
    await overlay.close();
  } finally {
    observer.ws.close();
  }
});
test("a full real-time rehearsal wins, mirrors to OBS, and exports a correctly labeled mission", async ({
  page,
  context,
  request,
}) => {
  const observer = await watch();
  try {
    await page.goto("/");
    await page.getByLabel("Simulated crew", { exact: true }).check();
    await page.getByLabel("Training pilot", { exact: true }).check();
    await page.getByRole("button", { name: "Launch rescue" }).click();
    const overlay = await context.newPage();
    await overlay.setViewportSize({ width: 1920, height: 1080 });
    await overlay.goto("/overlay");
    await overlay.waitForSelector("canvas");
    await expect
      .poll(() => observer.read()?.game.actions, { timeout: 15000 })
      .toBeGreaterThan(3);
    await page.screenshot({ path: "docs/screen-flight.png", fullPage: true });
    await expect
      .poll(
        () =>
          observer.read().game.overdriveUntil > observer.read().game.elapsed,
        { timeout: 30000 },
      )
      .toBe(true);
    await overlay.screenshot({ path: "docs/screen-all-hands.png" });
    await expect
      .poll(() => observer.read().game.rescued, { timeout: 40000 })
      .toBeGreaterThan(0);
    await overlay.screenshot({ path: "docs/screen-broadcast.png" });
    await expect(
      page.getByRole("heading", { name: "You brought them home." }),
    ).toBeVisible({ timeout: 110000 });
    await expect(
      overlay.getByRole("heading", { name: "You brought them home." }),
    ).toBeVisible();
    expect(observer.read().game.rescued).toBe(3);
    expect(observer.read().game.people).toBe(13);
    const report = await (await request.get("/api/report")).json();
    expect(report.simulated).toBe(true);
    expect(report.phase).toBe("won");
    expect(report.survivors).toBe(13);
    expect(report.crewActions).toBeGreaterThan(30);
    expect(report.crew.every((c: { simulated: boolean }) => c.simulated)).toBe(
      true,
    );
    await page.screenshot({ path: "docs/screen-result.png", fullPage: true });
    await overlay.screenshot({ path: "artifacts/demo/result-frame.png" });
    await overlay.waitForTimeout(8000);
    const video = overlay.video();
    await overlay.close();
    await video?.saveAs("artifacts/demo/last-signal-rehearsal-raw.webm");
    await page.getByRole("button", { name: "Fly again" }).click();
    await expect(
      page.getByRole("button", { name: "Launch rescue" }),
    ).toBeVisible();
  } finally {
    observer.ws.close();
  }
});
test("mobile layout remains within the viewport and setup controls work", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Launch rescue" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "docs/screen-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Connect Twitch" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("TWITCH_CLIENT_ID");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
