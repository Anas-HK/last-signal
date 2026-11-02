// Records real Canvas frames and Web Audio in the same MediaRecorder stream.
// Keyboard inputs are automated; rehearsal stays labeled. No game state is injected.
import { chromium } from "@playwright/test";
import WebSocket from "ws";
import fs from "node:fs";
const origin = process.argv[2] || "http://localhost:3304";
const out = "artifacts/showcase";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (destination, ...args) {
    if (destination === this.context.destination && !window.__demoAudioDest) {
      const recording = this.context.createMediaStreamDestination();
      window.__demoAudioDest = recording;
      connect.call(this, recording);
    }
    return connect.call(this, destination, ...args);
  };
});
await page.goto(origin);
await page.waitForSelector("canvas");
const config = await (await fetch(`${origin}/api/config`)).json();
const ws = new WebSocket(`${origin.replace("http", "ws")}/ws?key=${config.operatorKey}`, { origin });
let state;
const events = new Map();
ws.on("message", (data) => {
  const message = JSON.parse(data.toString());
  if (message.type !== "state") return;
  state = message.game;
  for (const event of state.events) events.set(`${state.id}-${event.id}`, { ...event, recordedAt: Date.now() });
});
await new Promise((resolve) => ws.once("open", resolve));
const send = (message) => ws.send(JSON.stringify(message));
const command = (name, command) => send({ type: "command", name, command });
try {
  send({ type: "action", action: "reset" });
  await page.waitForTimeout(250);
  await page.getByLabel("Simulated crew", { exact: true }).uncheck();
  await page.getByLabel("Training pilot", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Turn on sound & music", exact: true }).click();
  await page.waitForFunction(() => window.__demoAudioDest && window.__lastSignalAudio().context === "running");
  for (const name of ["nova_rae", "orbit_olive", "pixelpilot"]) command(name, "join");
  await page.evaluate(() => {
    const stream = document.querySelector("canvas").captureStream(30);
    for (const track of window.__demoAudioDest.stream.getAudioTracks()) stream.addTrack(track);
    window.__demoChunks = [];
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9,opus", videoBitsPerSecond: 8000000 });
    recorder.ondataavailable = (e) => { if (e.data.size) window.__demoChunks.push(e.data); };
    window.__demoRecorder = recorder;
    window.__demoStarted = performance.now();
    recorder.start(1000);
  });
  const recordedAt = Date.now();
  await page.waitForTimeout(3500);
  await page.getByRole("button", { name: "Launch rescue", exact: true }).click();
  await page.getByTestId("flight-canvas").focus();
  let supportAt = -100, dropAt = -100, meteorAt = -100, dashAt = -100;
  let held = new Set();
  const milestones = [];
  const powers = new Set();
  let lastPower = "";
  while (Date.now() - recordedAt < 155000) {
    if (!state || state.phase !== "running" || state.countdown > 0) {
      if (state?.phase === "won" || state?.phase === "lost") break;
      await page.waitForTimeout(80); continue;
    }
    const t = state.elapsed;
    if (t - supportAt > 2.5) {
      command("nova_rae", "shield"); command("orbit_olive", "boost"); command("pixelpilot", "repair"); supportAt = t;
    }
    if (state.drops.length === 0 && !state.ship.powerup && t - dropAt > 2) {
      command(`gift_${Math.floor(t)}`, "drop"); dropAt = t;
    }
    if (t - meteorAt > 14) { command(`comet_fan_${Math.floor(t)}`, "meteor"); meteorAt = t; }
    const pod = state.pods.find((p) => p.status === "waiting" && p.x - state.distance > state.ship.x - 100);
    const podNear = pod && pod.x - state.distance < 700;
    const crate = state.drops.find((d) => d.x > state.ship.x - 40);
    const targetY = podNear ? pod.y : crate ? crate.y : 330 + Math.sin(t * 0.35) * 90;
    const keys = new Set();
    if (targetY - state.ship.y > 12) keys.add("s");
    if (targetY - state.ship.y < -12) keys.add("w");
    if ((t % 4 < 2.2 || state.ship.rapid > 0) && state.ship.overheated <= 0) keys.add(" ");
    for (const key of held) if (!keys.has(key)) await page.keyboard.up(key);
    for (const key of keys) if (!held.has(key)) await page.keyboard.down(key);
    held = keys;
    if (state.ship.powerup && state.ship.powerup.kind !== lastPower) {
      lastPower = state.ship.powerup.kind;
      await page.waitForTimeout(800);
      milestones.push({ feature: lastPower, at: (Date.now() - recordedAt) / 1000 });
      powers.add(lastPower);
      console.log(`POWER-UP ${lastPower} at ${(Date.now() - recordedAt) / 1000}s`);
      await page.screenshot({ path: `${out}/${lastPower}.png`, fullPage: true });
      await page.keyboard.press("e");
    } else if (!state.ship.powerup) lastPower = "";
    if (!podNear && state.ship.boost >= 40 && t - dashAt > 9) {
      await page.keyboard.press("Shift"); dashAt = t;
      milestones.push({ feature: "dash", at: (Date.now() - recordedAt) / 1000 });
    }
    await page.waitForTimeout(80);
  }
  for (const key of held) await page.keyboard.up(key);
  console.log(`Result ${state.phase}, ${state.people} survivors; power-ups: ${[...powers]}`);
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${out}/result.png`, fullPage: true });
  await page.locator(".flight-stage").screenshot({ path: `${out}/result-stage.png` });
  const base64 = await page.evaluate(async () => {
    const recorder = window.__demoRecorder;
    await new Promise((resolve) => { recorder.onstop = resolve; recorder.stop(); });
    const blob = new Blob(window.__demoChunks, { type: recorder.mimeType });
    return await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.slice(reader.result.indexOf("base64,") + 7)); reader.readAsDataURL(blob); });
  });
  fs.writeFileSync(`${out}/gameplay-with-audio.webm`, Buffer.from(base64, "base64"));
  if (fs.statSync(`${out}/gameplay-with-audio.webm`).size < 100000) throw new Error("Recorded media is unexpectedly small.");
  const report = await (await fetch(`${origin}/api/report`)).json();
  fs.writeFileSync(`${out}/recording.json`, JSON.stringify({ recordedAt, report, powers: [...powers], milestones, events: [...events.values()], errors, input: "Automated keyboard control with labeled simulated chat; built-in training pilot disabled" }, null, 2));
  if (powers.size !== 3) throw new Error("Recording does not show all three power-ups; record additional footage before publishing.");
  if (errors.length) throw new Error(`Browser errors: ${errors.join(", ")}`);
} finally {
  ws.close(); await browser.close();
}
