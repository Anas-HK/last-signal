// Assemble an actual browser recording with explanatory cards and optional draft speech.
// Requires ffmpeg/ffprobe on PATH and: powershell -File scripts/narrate-demo.ps1
import { chromium } from "@playwright/test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
const out = "artifacts/demo";
fs.mkdirSync(out, { recursive: true });
const font = fs.readFileSync("public/fonts/font-3.ttf").toString("base64");
const mono = fs.readFileSync("public/fonts/font-0.ttf").toString("base64");
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});
function html(content) {
  return `<!doctype html><html><head><style>@font-face{font-family:Space;src:url(data:font/ttf;base64,${font})}@font-face{font-family:Mono;src:url(data:font/ttf;base64,${mono})}*{box-sizing:border-box}body{margin:0;background:#080d14;color:#eeeee6;font-family:Space,sans-serif;padding:90px 115px;height:1080px;overflow:hidden}.top{display:flex;justify-content:space-between;border-bottom:1px solid #2b414b;padding-bottom:30px;font:20px Mono;letter-spacing:3px;color:#77929e}.amber{color:#f5b65d}.cyan{color:#70ead8}h1{font-weight:400;font-size:120px;line-height:1.05;letter-spacing:-5px;margin:90px 0 30px}p{font-size:33px;color:#93aab5;line-height:1.6}.bottom{position:absolute;bottom:85px;left:115px;right:115px;border-top:1px solid #2b414b;padding-top:30px;display:flex;justify-content:space-between;font:17px Mono;color:#668895}.pill{display:inline-block;font:17px Mono;padding:15px 24px;border:1px solid #f5b65d55;color:#f5b65d;border-radius:5px;margin-top:35px}.row{display:flex;gap:22px;align-items:center;font-size:29px;margin:45px 0}.node{padding:25px 28px;border:1px solid #334e5b;border-radius:7px;background:#101c26}.arrow{color:#70ead8}.small{font:19px Mono;color:#8ba6b2}.checks{display:flex;gap:55px;margin-top:50px}.checks strong{display:block;font-size:55px;font-weight:400;color:#f5b65d}.checks span{font:17px Mono;color:#6f8b99}</style></head><body>${content}</body></html>`;
}
await page.setContent(
  html(
    `<div class="top"><span class="amber">✦ LAST SIGNAL</span><span>CODEX × TWITCHCON</span></div><h1>You fly.<br/><span class="cyan">Chat keeps you alive.</span></h1><p>One pilot. A whole chat of lifelines.</p><div class="pill">WORKING REHEARSAL · SIMULATED CHAT · REAL GAME ENGINE</div><div class="bottom"><span>NO ONE GETS HOME ALONE.</span><span>BUILT WITH OPENAI CODEX</span></div>`,
  ),
);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out + "/intro.png" });
await page.setContent(
  html(
    `<div class="top"><span class="amber">LAST SIGNAL / ENGINE ROOM</span><span>BUILT IN CODEX</span></div><h1 style="font-size:83px;margin-top:65px">An actual game.<br/><span class="cyan">An actual community role.</span></h1><div class="row"><div class="node">Twitch chat</div><span class="arrow">→</span><div class="node">Game engine</div><span class="arrow">→</span><div class="node">Pilot + OBS</div></div><div class="checks"><span><strong>18</strong>ENGINE / ADAPTER TESTS</span><span><strong>3</strong>BROWSER JOURNEYS</span><span><strong>13</strong>SURVIVORS BROUGHT HOME</span></div><p style="font-size:25px;margin-top:35px">Codex scoped, implemented, tested, and debugged the rescue.</p><div class="bottom"><span>github.com/Anas-HK/last-signal</span><span class="amber">NO ONE GETS HOME ALONE.</span></div>`,
  ),
);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out + "/codex.png" });
await page.goto("http://localhost:3001");
await page.waitForSelector("canvas");
await page
  .getByRole("button", { name: /anashk123|Connect Twitch/ })
  .first()
  .click();
await page.screenshot({ path: out + "/connection.png" });
await browser.close();
function run(args) {
  const r = spawnSync(
    "ffmpeg",
    ["-y", "-hide_banner", "-loglevel", "error", ...args],
    { stdio: "inherit" },
  );
  if (r.status !== 0) throw new Error("ffmpeg failed");
}
const common = [
  "-c:v",
  "libx264",
  "-preset",
  "veryfast",
  "-crf",
  "21",
  "-pix_fmt",
  "yuv420p",
  "-r",
  "30",
];
const fit =
  "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x080d14,setsar=1";
console.log("Encoding intro");
run([
  "-loop",
  "1",
  "-i",
  out + "/intro.png",
  "-t",
  "11",
  "-an",
  "-vf",
  fit,
  ...common,
  out + "/01.mp4",
]);
console.log("Encoding actual uncut rehearsal recording");
run([
  "-i",
  out + "/last-signal-rehearsal-raw.webm",
  "-t",
  "98",
  "-an",
  "-vf",
  fit + ",tpad=stop_mode=clone:stop_duration=120",
  ...common,
  out + "/02.mp4",
]);
console.log("Encoding real connection view");
run([
  "-loop",
  "1",
  "-i",
  out + "/connection.png",
  "-t",
  "19",
  "-an",
  "-vf",
  fit,
  ...common,
  out + "/03.mp4",
]);
console.log("Encoding Codex evidence card");
run([
  "-loop",
  "1",
  "-i",
  out + "/codex.png",
  "-t",
  "24",
  "-an",
  "-vf",
  fit,
  ...common,
  out + "/04.mp4",
]);
fs.writeFileSync(
  out + "/concat.txt",
  "file '01.mp4'\nfile '02.mp4'\nfile '03.mp4'\nfile '04.mp4'\n",
);
run([
  "-f",
  "concat",
  "-safe",
  "0",
  "-i",
  out + "/concat.txt",
  "-c",
  "copy",
  out + "/picture.mp4",
]);
const offsets = [0, 11, 38, 25, 53, 68, 94, 109, 128];
const audio = [];
for (let i = 1; i <= 9; i++)
  audio.push("-i", `${out}/voice/${String(i).padStart(2, "0")}.wav`);
const filter =
  offsets
    .map((t, i) => `[${i + 1}:a]adelay=${t * 1000}:all=1[a${i}]`)
    .join(";") +
  ";" +
  offsets.map((_, i) => `[a${i}]`).join("") +
  "amix=inputs=9:duration=longest:normalize=0,apad=pad_dur=8[voice]";
console.log("Adding disclosed rehearsal narration");
run([
  "-i",
  out + "/picture.mp4",
  ...audio,
  "-filter_complex",
  filter,
  "-map",
  "0:v",
  "-map",
  "[voice]",
  "-t",
  "152",
  "-c:v",
  "copy",
  "-c:a",
  "aac",
  "-b:a",
  "192k",
  "-movflags",
  "+faststart",
  out + "/last-signal-demo.mp4",
]);
console.log(
  "Saved " +
    out +
    "/last-signal-demo.mp4 (2:32). Draft narration is synthesized; replace it with your own voice if preferred.",
);
