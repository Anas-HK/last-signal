// Mixes downloaded Grady/Seed Audio narration with the actual game audio.
import fs from "node:fs";
import { spawnSync } from "node:child_process";
const root = "artifacts/showcase";
function probe(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" });
  if (r.status) throw new Error(r.stderr);
  return Number(r.stdout.trim());
}
const record = JSON.parse(fs.readFileSync(`${root}/recording.json`, "utf8"));
const total = probe(`${root}/last-signal-captions-game-audio.mp4`);
const first = (kind) => record.milestones.find((m) => m.feature === kind).at;
const schedule = [0, 7, first("nova"), 20.5, first("overdrive"), first("bubble"), 76, 88, total - 9];
const segments = schedule.map((at, i) => ({ index: i, at, duration: probe(`${root}/voice/${i}.wav`) })).sort((a, b) => a.at - b.at);
for (let i = 0; i < segments.length; i++) {
  const segment = segments[i];
  if (segment.at + segment.duration > (segments[i + 1]?.at ?? total)) throw new Error(`Voice ${segment.index} overlaps another segment or the ending.`);
}
const delayed = schedule.map((at, i) => `[${i + 1}:a]loudnorm=I=-16:TP=-1.5:LRA=9,adelay=${Math.round(at * 1000)}:all=1[n${i}]`).join(";");
const filter = delayed + ";" + schedule.map((_, i) => `[n${i}]`).join("") + `amix=inputs=${schedule.length}:duration=longest:normalize=0,apad,asplit=2[voice][duck];[0:a][duck]sidechaincompress=threshold=0.025:ratio=4:attack=25:release=350[game];[game][voice]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.5:level=false[a]`;
const r = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", `${root}/last-signal-captions-game-audio.mp4`, ...schedule.flatMap((_, i) => ["-i", `${root}/voice/${i}.wav`]), "-filter_complex", filter, "-map", "0:v", "-map", "[a]", "-t", String(total), "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", `${root}/last-signal-voiceover-game-audio.mp4`], { encoding: "utf8" });
if (r.status) throw new Error(r.stderr);
fs.writeFileSync(`${root}/voice-timing.json`, JSON.stringify({ voice: "Grady", engine: "Seed Audio 1.0 through Higgsfield", synthetic: true, duration: total, segments }, null, 2));
console.log(`Mixed ${total}s with synchronized Grady narration and ducked game audio.`);
