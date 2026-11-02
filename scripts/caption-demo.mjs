import fs from "node:fs";
import { spawnSync } from "node:child_process";
const root = "artifacts/demo";
const segments = JSON.parse(fs.readFileSync(`${root}/narration.json`, "utf8"));
const cues = [];
function stamp(seconds) {
  const ms = Math.round(seconds * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
}
for (const match of segments) {
  const probe = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      `${root}/voice/${match.file}.wav`,
    ],
    { encoding: "utf8" },
  );
  if (probe.status !== 0) throw new Error("ffprobe failed");
  const duration = Number(probe.stdout.trim());
  const words = match.text.split(/\s+/);
  for (let n = 0; n < words.length; n += 12) {
    const part = words.slice(n, n + 12);
    const text =
      part.length > 6
        ? part.slice(0, 6).join(" ") + "\n" + part.slice(6).join(" ")
        : part.join(" ");
    cues.push({
      start: match.at + (n / words.length) * duration,
      end:
        match.at +
        (Math.min(n + 12, words.length) / words.length) * duration,
      text,
    });
  }
}
cues.sort((a, b) => a.start - b.start);
fs.writeFileSync(
  root + "/last-signal-demo.srt",
  cues
    .map(
      (c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`,
    )
    .join("\n"),
);
const result = spawnSync(
  "ffmpeg",
  [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    root + "/last-signal-demo.mp4",
    "-i",
    root + "/last-signal-demo.srt",
    "-map",
    "0:v",
    "-map",
    "0:a",
    "-map",
    "1:0",
    "-c",
    "copy",
    "-c:s",
    "mov_text",
    "-metadata:s:s:0",
    "language=eng",
    "-movflags",
    "+faststart",
    root + "/captioned.mp4",
  ],
  { stdio: "inherit" },
);
if (result.status !== 0) throw new Error("Subtitle mux failed");
fs.renameSync(root + "/captioned.mp4", root + "/last-signal-demo.mp4");
console.log("Captioned demo and .srt ready.");
