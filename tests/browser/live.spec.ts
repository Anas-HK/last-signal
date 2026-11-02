import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import WebSocket from "ws";
import type { Snapshot } from "../../shared/types.js";

// Opt in explicitly: VERIFY_TWITCH_CHANNEL=channel E2E_PORT=3302 npm run test:e2e
// This reads the real service, but never sends messages to Twitch chat.
test("real Twitch UI connection, live launch, simulated-command rejection and disconnect pause", async ({ page, request }) => {
  const channel = process.env.VERIFY_TWITCH_CHANNEL;
  test.skip(!channel, "Opt-in real-network check requires VERIFY_TWITCH_CHANNEL");
  const port = process.env.E2E_PORT || "3002";
  const origin = `http://localhost:${port}`;
  const config = await (await request.get("/api/config")).json();
  const headers = { Origin: origin, "X-Operator-Key": config.operatorKey };
  const ws = new WebSocket(`ws://localhost:${port}/ws?key=${config.operatorKey}`, { origin });
  let latest!: Snapshot;
  const notices: string[] = [];
  ws.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.type === "state") latest = message;
    if (message.type === "notice") notices.push(message.text);
  });
  await new Promise<void>((resolve) => ws.once("open", () => resolve()));
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "Connect Twitch", exact: true }).click();
    await page.getByLabel("Your Twitch channel name").fill(channel!);
    await page.getByRole("button", { name: "Join live chat", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 20000 });
    await expect.poll(() => latest.twitch.status).toBe("connected");
    expect(latest.twitch.transport).toBe("irc");
    expect(latest.game.mode).toBe("live");
    await page.screenshot({ path: "artifacts/validation/live-connected.png", fullPage: true });
    await page.getByRole("button", { name: "Launch rescue", exact: true }).click();
    await expect.poll(() => latest.game.phase).toBe("running");
    await expect.poll(() => latest.game.countdown, { timeout: 7000 }).toBe(0);
    for (const command of ["drop", "meteor"])
      ws.send(JSON.stringify({ type: "command", name: "fixture_sim", command }));
    await expect.poll(() => notices.filter((text) => text.includes("source does not match")).length).toBe(2);
    expect(latest.game.drops).toHaveLength(0);
    expect(latest.game.meteors).toHaveLength(0);
    mkdirSync("artifacts/validation", { recursive: true });
    writeFileSync("artifacts/validation/live-ui.json", JSON.stringify({
      checkedAt: new Date().toISOString(),
      scope: "Actual Twitch handshake, live launch and rejection of simulated commands; no viewer-sent commands verified",
      twitch: latest.twitch, mode: latest.game.mode, phase: latest.game.phase,
    }, null, 2));
    expect((await request.post("/api/twitch/disconnect", { headers })).ok()).toBe(true);
    await expect.poll(() => latest.game.phase).toBe("paused");
    await page.getByRole("button", { name: "Reset mission", exact: true }).click();
    await expect.poll(() => latest.game.phase).toBe("ready");
    expect((await request.post("/api/mode", { headers, data: { mode: "demo" } })).ok()).toBe(true);
  } finally {
    await request.post("/api/twitch/disconnect", { headers });
    ws.close();
  }
});
