// Fresh submission export. Preserves the entire rescue and refuses exports over three minutes.
import fs from "node:fs";
import { spawnSync } from "node:child_process";
const out = "artifacts/demo";
function run(binary, args) {
  const r = spawnSync(binary, args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr || String(r.error));
  return r.stdout;
}
function duration(file) {
  return Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).trim());
}
const scenes = [
  ["docs/screen-ready.png", 8, true],
  ["docs/screen-chat-chaos.png", 3, true],
  [`${out}/last-signal-gameplay-raw.webm`, 0, false],
  [`${out}/last-signal-rehearsal-raw.webm`, 0, false],
  ["artifacts/validation/live-connected.png", 11, true],
  ["docs/screen-result.png", 14, true],
];
for (const scene of scenes) if (!scene[1]) scene[1] = duration(scene[0]);
const flightStart = scenes.slice(0, 3).reduce((sum, scene) => sum + scene[1], 0);
const connectionStart = flightStart + scenes[3][1];
const total = connectionStart + 25;
if (total >= 180) throw new Error(`Export would be ${total}s. Shorten the still scenes, never truncate the rescue.`);
const narration = [
  [0, "Last Signal. You fly. Chat keeps you alive. Built with OpenAI Codex."],
  [8, "Fire the laser. Dash with fuel from chat. Catch a viewer crate and press E to fire its power up. Viewers can also throw named meteors."],
  [flightStart, "This is a complete, uncut rescue with clearly labeled simulated chat and the training pilot. Every collision, rescue, and result is calculated by the game engine."],
  [flightStart + 24, "Three distinct viewers coordinate shields, boost, and repair within six seconds. All Hands nearly doubles the rescue range. One viewer cannot fill all three stations."],
  [flightStart + 50, "Shields absorb impacts. Repairs restore the hull. Boost fills the dash tank, and the pilot chooses when to burn it. Useful contributions earn credit."],
  [flightStart + 82, "Three escape pods. Thirteen survivors. A two minute jump window. Bring them home, then credit the crew who made it happen."],
  [connectionStart, "The console also connects to actual read only Twitch chat. This capture verifies the connection. No viewer messages were received in this check."],
  [connectionStart + 11, "Codex built and tested the game, Twitch adapter, and broadcast view. Source, validation, and the session record are on GitHub. No one gets home alone."],
].map(([at, text], i) => ({ at, text, file: String(i + 1).padStart(2, "0") }));
fs.writeFileSync(`${out}/narration.json`, JSON.stringify(narration, null, 2));
run("powershell.exe", ["-NoProfile", "-File", "scripts/narrate-submission.ps1"]);
for (let i = 0; i < narration.length; i++)
  if (narration[i].at + duration(`${out}/voice/${narration[i].file}.wav`) > (narration[i + 1]?.at ?? total))
    throw new Error(`Speech ${i + 1} exceeds its slot. Shorten its text.`);
const fit = "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x080d14,setsar=1";
for (const [i, [file, seconds, still]] of scenes.entries()) {
  console.log(`Encoding scene ${i + 1}/${scenes.length}`);
  run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...(still ? ["-loop", "1"] : []), "-i", file, "-t", String(seconds), "-an", "-vf", fit, "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-r", "30", `${out}/scene-${i}.mp4`]);
}
fs.writeFileSync(`${out}/concat.txt`, scenes.map((_, i) => `file 'scene-${i}.mp4'`).join("\n"));
run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", `${out}/concat.txt`, "-c", "copy", `${out}/picture.mp4`]);
const filter = narration.map((n, i) => `[${i + 1}:a]adelay=${Math.round(n.at * 1000)}:all=1[a${i}]`).join(";") + ";" + narration.map((_, i) => `[a${i}]`).join("") + `amix=inputs=${narration.length}:duration=longest:normalize=0,apad[voice]`;
run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", `${out}/picture.mp4`, ...narration.flatMap((n) => ["-i", `${out}/voice/${n.file}.wav`]), "-filter_complex", filter, "-map", "0:v", "-map", "[voice]", "-t", String(total), "-c:v", "copy", "-c:a", "aac", "-movflags", "+faststart", `${out}/last-signal-demo.mp4`]);
fs.writeFileSync(`${out}/timeline.json`, JSON.stringify({ total, flightStart, connectionStart, scenes, audio: "Offline synthesized narration; game audio is not included" }, null, 2));
console.log(`Exported ${total.toFixed(1)} seconds.`);
