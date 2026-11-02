// Records real Canvas frames and Web Audio in the same MediaRecorder stream.
// Keyboard inputs are automated; rehearsal stays labeled. No game state is injected.
import { chromium } from "@playwright/test";
import WebSocket from "ws";
import fs from "node:fs";
const origin = process.argv[2] || "http://localhost:3304";
const live = process.argv.includes("--live");
const out = live ? "artifacts/live-proof" : "artifacts/showcase";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ["--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"] });
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
let twitch, lastCommandAt = 0;
const realCommands = [];
const events = new Map();
ws.on("message", (data) => {
  const message = JSON.parse(data.toString());
  if (message.type !== "state") return;
  state = message.game;
  twitch = message.twitch;
  if (live && twitch.lastCommand && twitch.lastCommand.at !== lastCommandAt) {
    lastCommandAt = twitch.lastCommand.at;
    realCommands.push({...twitch.lastCommand, recordedAt: Date.now()});
    console.log("REAL TWITCH", JSON.stringify(twitch.lastCommand));
    void page.evaluate((m) => { window.__demoChat ??= []; window.__demoChat.push(m); window.__demoChat=window.__demoChat.slice(-7); }, twitch.lastCommand);
  }
  for (const event of state.events) events.set(`${state.id}-${event.id}`, { ...event, recordedAt: Date.now() });
});
await new Promise((resolve) => ws.once("open", resolve));
const send = (message) => ws.send(JSON.stringify(message));
const command = (name, command) => {
  send({ type: "command", name, command });
  void page.evaluate(({name, command}) => {
    window.__demoChat ??= [];
    window.__demoChat.push({name, command});
    window.__demoChat = window.__demoChat.slice(-7);
  }, {name, command});
};
try {
  send({ type: "action", action: "reset" });
  await page.waitForTimeout(250);
  await page.getByLabel("Simulated crew", { exact: true }).uncheck();
  await page.getByLabel("Training pilot", { exact: true }).uncheck();
  if (live) {
    await page.getByRole("button", {name:"Connect Twitch",exact:true}).click();
    await page.getByLabel("Your Twitch channel name").fill("anashk123");
    await page.getByRole("button", {name:"Join live chat",exact:true}).click();
    await page.getByRole("dialog").waitFor({state:"hidden",timeout:20000});
  }
  await page.getByRole("button", { name: "Turn on sound & music", exact: true }).click();
  await page.waitForFunction(() => window.__demoAudioDest && window.__lastSignalAudio().context === "running");
  if (!live) for (const name of ["nova_rae", "orbit_olive", "pixelpilot"]) command(name, "join");
  await page.evaluate((live) => {window.__demoLive = live;}, live);
  await page.evaluate(() => {
    const game = document.querySelector("canvas");
    const composite = document.createElement("canvas");
    composite.width = 1600; composite.height = 900;
    const ctx = composite.getContext("2d");
    window.__demoFrames = [];
    function draw(now) {
      window.__demoFrames.push(now);
      ctx.fillStyle = "#080d14"; ctx.fillRect(0,0,1600,900);
      ctx.font = "bold 30px sans-serif"; ctx.fillStyle = "#eeeae2"; ctx.fillText("LAST SIGNAL",24,48);
      ctx.font = "18px sans-serif"; ctx.fillStyle = "#f5b65d"; ctx.fillText("YOU FLY. CHAT KEEPS YOU ALIVE.",270,46);
      ctx.drawImage(game,16,100,1200,660);
      ctx.fillStyle = "#101c26"; ctx.fillRect(1236,100,348,660);
      ctx.fillStyle = "#70ead8"; ctx.font = "bold 20px sans-serif"; ctx.fillText("CREW CHAT",1254,135);
      ctx.fillStyle = window.__demoLive ? "#70ead8" : "#f5b65d"; ctx.font = "16px sans-serif"; ctx.fillText(window.__demoLive ? "TWITCH LIVE - #anashk123" : "SIMULATED REHEARSAL VIEWERS",1254,162);
      ctx.fillStyle = "#92a6b2"; ctx.font = "15px sans-serif"; ctx.fillText("These commands are sent to the game",1254,187);
      const colors = {shield:"#70ead8",boost:"#f5b65d",repair:"#cbb4ff",drop:"#e9f6ff",meteor:"#ff7a59",join:"#92a6b2"};
      for (const [i,m] of (window.__demoChat||[]).entries()) {
        const y=232+i*72;
        ctx.font="bold 21px sans-serif"; ctx.fillStyle=colors[m.command]||"#fff"; ctx.fillText(m.name,1254,y);
        ctx.font="22px monospace"; ctx.fillStyle="#eeeae2"; ctx.fillText("!"+m.command,1254,y+29);
      }
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
    const stream = composite.captureStream(60);
    for (const track of window.__demoAudioDest.stream.getAudioTracks()) stream.addTrack(track);
    window.__demoChunks = [];
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8,opus", videoBitsPerSecond: 12000000 });
    recorder.ondataavailable = (e) => { if (e.data.size) window.__demoChunks.push(e.data); };
    window.__demoRecorder = recorder;
    window.__demoStarted = performance.now();
    recorder.start(1000);
  });
  const recordedAt = Date.now();
  await page.waitForTimeout(3500);
  await page.getByRole("button", { name: "Launch rescue", exact: true }).click();
  await page.getByTestId("flight-canvas").focus();
  if (live) console.log("LIVE READY: send !join, !boost, !drop, !meteor in #anashk123 now.");
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
    if (!live && t - supportAt > 2.5) {
      command("nova_rae", "shield"); command("orbit_olive", "boost"); command("pixelpilot", "repair"); supportAt = t;
    }
    if (!live && state.drops.length === 0 && !state.ship.powerup && t - dropAt > 2) {
      command(["lunar_lou","neonfox","cosmic_kai","astrobee","echo_echo","tinycomet"][Math.floor(t / 7) % 6], "drop"); dropAt = t;
    }
    if (!live && t - meteorAt > 14) { command("comet_fan", "meteor"); meteorAt = t; }
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
      await page.keyboard.press("e");
    } else if (!state.ship.powerup) lastPower = "";
    if (!podNear && state.ship.boost >= (live ? 20 : 40) && t - dashAt > 9) {
      await page.keyboard.press("Shift"); dashAt = t;
      milestones.push({ feature: "dash", at: (Date.now() - recordedAt) / 1000 });
    }
    await page.waitForTimeout(80);
    if (live && realCommands.some((m)=>m.command==="meteor" && m.accepted) && realCommands.some((m)=>m.command==="drop" && m.accepted) && t > 30) break;
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
  const frameTimes = await page.evaluate(() => window.__demoFrames);
  fs.writeFileSync(`${out}/frame-times.json`, JSON.stringify(frameTimes));
  fs.writeFileSync(`${out}/gameplay-with-audio.webm`, Buffer.from(base64, "base64"));
  if (fs.statSync(`${out}/gameplay-with-audio.webm`).size < 100000) throw new Error("Recorded media is unexpectedly small.");
  const report = await (await fetch(`${origin}/api/report`)).json();
  fs.writeFileSync(`${out}/recording.json`, JSON.stringify({ recordedAt, report, twitch, realCommands, powers: [...powers], milestones, events: [...events.values()], errors, input: live ? "Actual Twitch commands; automated keyboard control; no simulated inputs" : "Automated keyboard control with labeled simulated chat; built-in training pilot disabled" }, null, 2));
  if (!live && powers.size !== 3) throw new Error("Recording does not show all three power-ups; record additional footage before publishing.");
  if (errors.length) throw new Error(`Browser errors: ${errors.join(", ")}`);
} finally {
  ws.close(); await browser.close();
}
