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
const visual = "[0:v]split=2[layout][motion];[motion]crop=1200:660:16:100,scale=640:352,minterpolate=fps=60:mi_mode=mci:mc_mode=obmc:me_mode=bilat:me=epzs:mb_size=16:search_param=4,scale=1200:660:flags=lanczos,unsharp=3:3:0.4[smooth];[layout]fps=60,split=3[base][topSrc][bottomSrc];[topSrc]crop=1200:70:16:100[top];[bottomSrc]crop=1200:75:16:685[bottom];[base][smooth]overlay=16:100[mid];[mid][top]overlay=16:100[withTop];[withTop][bottom]overlay=16:685,scale=1920:1080,subtitles=artifacts/live-proof/captions.ass:fontsdir=public/fonts[v]";
run(["-ss",String(start),"-i",`${live}/gameplay-with-audio.webm`,"-filter_complex",visual,"-map","[v]","-map","0:a","-r","60","-c:v","libx264","-preset","veryfast","-crf","19","-pix_fmt","yuv420p","-af","alimiter=limit=0.5:level=false","-c:a","aac","-b:a","192k",`${live}/live-chat-clip.mp4`]);
run(["-i",`${live}/live-chat-clip.mp4`,"-loop","1","-i",`${live}/connection-confirmed.png`,"-filter_complex","[1:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x080d14[v]","-map","[v]","-map","0:a","-t","5","-r","60","-c:v","libx264","-preset","veryfast","-crf","19","-pix_fmt","yuv420p","-c:a","aac","-b:a","192k",`${live}/connection-clip.mp4`]);
for (const variant of ["voiceover", "captions"]) {
  const name=`last-signal-${variant}-game-audio.mp4`;
  const files=[`artifacts/showcase/${name}`,`${live}/live-chat-clip.mp4`,`${live}/connection-clip.mp4`];
  fs.writeFileSync(`${out}/concat-${variant}.txt`,files.map((file)=>`file '${path.resolve(file).replaceAll("\\","/")}'`).join("\n"));
  run(["-f","concat","-safe","0","-i",`${out}/concat-${variant}.txt`,"-c","copy","-movflags","+faststart",`${out}/${name}`]);
}
const baseDuration=duration("artifacts/showcase/last-signal-captions-game-audio.mp4");
const liveDuration=duration(`${live}/live-chat-clip.mp4`);
const stamp=(s)=>new Date(Math.round(s*1000)).toISOString().slice(11,23).replace(".",",");
fs.writeFileSync(`${out}/last-signal-showcase.srt`,fs.readFileSync("artifacts/showcase/last-signal-showcase.srt","utf8")+`\n11\n${stamp(baseDuration)} --> ${stamp(baseDuration+liveDuration)}\nLIVE TWITCH: anashk999\nReal commands received and accepted by the game.\n\n12\n${stamp(baseDuration+liveDuration)} --> ${stamp(baseDuration+liveDuration+5)}\nConnected to Twitch IRC\nFour real messages received.\n`);
fs.writeFileSync(`${out}/final-video-evidence.json`,JSON.stringify({fps:60,motionInterpolation:true,chatTextInterpolated:false,realCommands:record.realCommands,baseDuration,liveDuration,finalDuration:duration(`${out}/last-signal-voiceover-game-audio.mp4`)},null,2));
console.log("Both final demos include real Twitch commands and connection proof.");
