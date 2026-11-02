// Exports real game audio, captions in a dedicated lower band, and optional neural narration.
// Usage: node scripts/export-showcase.mjs [neural-voiceover.wav]
import fs from "node:fs";
import { spawnSync } from "node:child_process";
const root = "artifacts/showcase";
function run(args) {
  const result = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-progress", "artifacts/showcase/encode-progress.txt", ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || String(result.error));
}
const record = JSON.parse(fs.readFileSync(`${root}/recording.json`, "utf8"));
const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", `${root}/gameplay-with-audio.webm`], { encoding: "utf8" });
let rawDuration = Number(probe.stdout.trim());
if (!Number.isFinite(rawDuration)) {
  const packets = spawnSync("ffprobe", ["-v", "error", "-show_entries", "packet=pts_time,duration_time", "-of", "json", `${root}/gameplay-with-audio.webm`], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  rawDuration = Math.max(...JSON.parse(packets.stdout).packets.map((p) => Number(p.pts_time) + Number(p.duration_time || 0.033)));
}
const duration = rawDuration + 4;
if (!Number.isFinite(duration) || duration >= 180) throw new Error("Invalid showcase duration");
const first = (kind) => record.milestones.find((m) => m.feature === kind).at;
const cues = [
  [0, 4, "LAST SIGNAL\\NYou fly. Chat keeps you alive."],
  [5, 9, "SPACE fires the laser.\\NWatch the heat meter."],
  [10, 13, "SHIFT burns the dash fuel supplied by chat."],
  [first("nova"), first("nova") + 5, "NOVA BOMB\\NCatch a crate. Press E to clear the screen."],
  [23, 28, "Viewers can throw named meteors.\\NDodge the warning line or shoot them down."],
  [first("overdrive"), first("overdrive") + 6, "OVERDRIVE GUNS\\NRapid triple lasers for six seconds."],
  [first("bubble"), first("bubble") + 5, "BUBBLE SHIELD\\NFive seconds to ram through danger."],
  [76, 82, "Three viewers. Three stations. Six seconds.\\NALL HANDS expands your rescue range."],
  [88, 93, "Three escape pods. Thirteen survivors.\\NGet everyone home before the jump window closes."],
  [rawDuration - 5, duration, `ALL ${record.report.survivors} SURVIVORS HOME\\NBuilt with OpenAI Codex. Source on GitHub.`],
].sort((a, b) => a[0] - b[0]);
for (let i = 0; i < cues.length - 1; i++) cues[i][1] = Math.min(cues[i][1], cues[i + 1][0] - 0.15);
const stamp = (t) => {
  const cs = Math.round(t * 100);
  return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, "0")}:${String(Math.floor(cs / 100) % 60).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
};
const ass = `[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Space Grotesk,34,&H00F3EEE8,&H000000FF,&H00140D08,&H00140D08,0,0,0,0,100,100,0,0,1,0,0,2,100,100,24,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
fs.writeFileSync(`${root}/showcase.ass`, ass + cues.map(([start, end, text]) => `Dialogue: 0,${stamp(start)},${stamp(end)},Default,,0,0,0,,${text}`).join("\n") + "\n");
const srtStamp = (t) => {
  const ms = Math.round(t * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
};
fs.writeFileSync(`${root}/last-signal-showcase.srt`, cues.map(([a, b, text], i) => `${i + 1}\n${srtStamp(a)} --> ${srtStamp(b)}\n${text.replaceAll("\\N", "\n")}\n`).join("\n"));
const visual = `[0:v]fps=60,tpad=stop_mode=clone:stop_duration=4[game];[1:v]scale=1440:792:force_original_aspect_ratio=decrease,pad=1440:792:(ow-iw)/2:(oh-ih)/2:color=0x080d14[result];[game][result]overlay=19:120:enable='gte(t,${rawDuration - 5})'[v]`;
run(["-i", `${root}/gameplay-with-audio.webm`, "-loop", "1", "-i", `${root}/result-stage.png`, "-filter_complex", visual, "-map", "[v]", "-map", "0:a", "-t", String(duration), "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-pix_fmt", "yuv420p", "-r", "60", "-af", "apad=pad_dur=4,loudnorm=I=-18:TP=-1.5:LRA=11,alimiter=limit=0.5:level=false", "-c:a", "aac", "-ar", "48000", "-b:a", "192k", "-movflags", "+faststart", `${root}/last-signal-clean-game-audio.mp4`]);
run(["-i",`${root}/last-signal-clean-game-audio.mp4`,"-vf","subtitles=artifacts/showcase/showcase.ass:fontsdir=public/fonts","-c:v","libx264","-preset","veryfast","-crf","17","-pix_fmt","yuv420p","-c:a","copy","-movflags","+faststart",`${root}/last-signal-captions-game-audio.mp4`]);
fs.writeFileSync(`${root}/export.json`,JSON.stringify({duration,nativeCapture:[1920,1080],downscaledForInterpolation:false,voiceoverCaptions:false,steering:record.steering},null,2));
console.log(`Exported sharp ${duration.toFixed(2)}s clean and captioned masters.`);
