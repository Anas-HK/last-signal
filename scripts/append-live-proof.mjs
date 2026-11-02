// Adds actual Twitch message reception and confirmed connection evidence to both exports.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
const live = "artifacts/live-proof";
const out = "artifacts/submission";
const record = JSON.parse(fs.readFileSync(`${live}/recording.json`, "utf8"));
for (const command of ["join", "boost", "drop", "meteor"])
  if (!record.realCommands.some((m) => m.command === command && m.accepted)) throw new Error(`Missing accepted real Twitch ${command}`);
const start = (record.realCommands[0].recordedAt - record.recordedAt) / 1000 - 2;
function duration(file) {
  const r=spawnSync("ffprobe",["-v","error","-show_entries","format=duration","-of","csv=p=0",file],{encoding:"utf8"});
  return Number(r.stdout.trim());
}
function run(args) {
  const r = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-progress", "artifacts/showcase/encode-progress.txt", ...args], {encoding:"utf8"});
  if (r.status !== 0) throw new Error(r.stderr);
}
const header = fs.readFileSync("artifacts/showcase/showcase.ass", "utf8").split("[Events]")[0];
fs.writeFileSync(`${live}/captions.ass`, header + "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.00,0:00:30.00,Default,,0,0,0,,LIVE TWITCH: anashk999\\NReal commands received and accepted by the game.\n");
const visual = "[0:v]fps=60,scale=1920:1080[v]";
if (!process.argv.includes("--reuse-clips")) {
run(["-ss",String(start),"-i",`${live}/gameplay-with-audio.webm`,"-filter_complex",visual,"-map","[v]","-map","0:a","-r","60","-c:v","libx264","-preset","veryfast","-crf","17","-pix_fmt","yuv420p","-af","alimiter=limit=0.5:level=false","-c:a","aac","-b:a","192k",`${live}/live-chat-clean.mp4`]);
run(["-i",`${live}/live-chat-clean.mp4`,"-vf","subtitles=artifacts/live-proof/captions.ass:fontsdir=public/fonts","-c:v","libx264","-preset","veryfast","-crf","17","-c:a","copy",`${live}/live-chat-clip.mp4`]);
run(["-i",`${live}/live-chat-clip.mp4`,"-loop","1","-i",`${live}/connection-confirmed.png`,"-filter_complex","[1:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x080d14[v]","-map","[v]","-map","0:a","-t","5","-r","60","-c:v","libx264","-preset","veryfast","-crf","17","-pix_fmt","yuv420p","-c:a","aac","-b:a","192k",`${live}/connection-clip.mp4`]);
}
const variants = process.argv.includes("--voiceover-only") ? ["voiceover"] : ["voiceover", "captions"];
for (const variant of variants) {
  const name=`last-signal-${variant}-game-audio.mp4`;
  const files=[`artifacts/showcase/${name}`,`${live}/${variant === "voiceover" ? "live-chat-clean.mp4" : "live-chat-clip.mp4"}`,`${live}/connection-clip.mp4`];
  fs.writeFileSync(`${out}/concat-${variant}.txt`,files.map((file)=>`file '${path.resolve(file).replaceAll("\\","/")}'`).join("\n"));
  const opening=variant === "voiceover"
    ? "[3:v]scale=1920:1080,fps=60,trim=duration=3.6,setpts=PTS-STARTPTS[intro];[0:v]trim=start=3.6,setpts=PTS-STARTPTS[baseRest];[intro][baseRest]concat=n=2:v=1:a=0[base]"
    : "[0:v]setpts=PTS-STARTPTS[base]";
  const rest=files.slice(1).map((_,i)=>`[${i+1}:v]setpts=PTS-STARTPTS[v${i+1}]`).concat(files.map((_,i)=>`[${i}:a]aresample=48000,asetpts=PTS-STARTPTS[a${i}]`)).join(";");
  const inputs="[base][a0]"+files.slice(1).map((_,i)=>`[v${i+1}][a${i+1}]`).join("");
  const fixed=`${opening};${rest};${inputs}concat=n=3:v=1:a=1[cv][a];[cv]fps=60[v]`;
  const args=files.flatMap(file=>["-i",file]);
  if (variant === "voiceover") args.push("-i","artifacts/showcase/ready-intro.webm");
  run([...args,"-filter_complex",fixed,"-map","[v]","-map","[a]","-c:v","libx264","-preset","veryfast","-crf","17","-pix_fmt","yuv420p","-r","60","-c:a","aac","-ar","48000","-b:a","192k","-movflags","+faststart",`${out}/${name}`]);
}
const baseDuration=duration("artifacts/showcase/last-signal-captions-game-audio.mp4");
const liveDuration=duration(`${live}/live-chat-clip.mp4`);
const stamp=(s)=>new Date(Math.round(s*1000)).toISOString().slice(11,23).replace(".",",");
fs.writeFileSync(`${out}/last-signal-showcase.srt`,fs.readFileSync("artifacts/showcase/last-signal-showcase.srt","utf8")+`\n11\n${stamp(baseDuration)} --> ${stamp(baseDuration+liveDuration)}\nLIVE TWITCH: anashk999\nReal commands received and accepted by the game.\n\n12\n${stamp(baseDuration+liveDuration)} --> ${stamp(baseDuration+liveDuration+5)}\nConnected to Twitch IRC\nFour real messages received.\n`);
fs.writeFileSync(`${out}/final-video-evidence.json`,JSON.stringify({fps:60,motionInterpolation:false,openingScene:"3.6 second local pre-game ready screen",chatTextInterpolated:false,realCommands:record.realCommands,baseDuration,liveDuration,finalDuration:duration(`${out}/last-signal-voiceover-game-audio.mp4`)},null,2));
console.log("Both final demos include real Twitch commands and connection proof.");
