# Demo script — target 2:35, hard limit 2:59

Lead with the ship and viewer contribution, not an architecture diagram. Record 1920×1080 at 60 fps if available. Keep the source label visible. Use an authorized Twitch channel if configured; otherwise say **rehearsal with simulated chat** aloud and keep the on-screen label.

| Time | Show | Narration |
|---|---|---|
| 0:00–0:10 | Flight screen: a shield lights up around the ship, viewer name visible. | “What if Twitch chat wasn't watching your spaceship, but keeping it alive? This is LAST SIGNAL.” |
| 0:10–0:24 | Pilot console and the three command stations. | “You fly. Chat is your crew. Shields, engines, and repairs all come from viewers. Every useful action becomes a named drone beside your ship.” |
| 0:24–0:39 | Click the game and dodge. Show a viewer's command arriving and its resource increasing. | “I'm the pilot. A viewer types !shield, and that shield actually absorbs an asteroid. These are game inputs, not suggestions.” |
| 0:39–0:55 | Recover Kepler; amber ring collapses, rescue event and manifest update. | “There are three escape pods and thirteen survivors. Fly into a rescue ring and they're aboard. Miss the signal, and you lose them.” |
| 0:55–1:14 | Three distinct viewers use the three roles; show ALL HANDS indicator and pulse. | “Here’s the part that takes a crew. Three different people coordinate three stations within six seconds. ALL HANDS doubles our rescue reach. One person can't do this alone.” |
| 1:14–1:30 | Storm sector, a shield block, a repair; overlay shows the same action. | “The storm hits harder. The crew has to decide what we need now. You see who saved the hull and who gave us the speed to beat the jump window.” |
| 1:30–1:48 | Third pod and jump gate; credits appear. | “We made it. Thirteen survivors, and the people who made it happen get the credits. It's a short, repeatable community moment between games or as a stream challenge.” |
| 1:48–2:08 | Connection dialog with actual channel status/message count, then OBS view. | LIVE VERSION: “This is connected directly to our Twitch channel through read-only chat. These commands came from actual viewers. OBS mirrors the same mission.” REHEARSAL VERSION: “This recording uses the labeled rehearsal crew. The same game connects to real Twitch chat without keys; OAuth and EventSub are optional. OBS mirrors the same mission.” |
| 2:08–2:25 | Source repository and test results, briefly. | “Codex built the game engine, Twitch integration, Canvas art, React interface, and automated tests, then helped debug the actual mission. The repository includes that session ID and a reproducible demo.” |
| 2:25–2:35 | Return to result screen and crew credits. | “LAST SIGNAL. One pilot. A whole chat of lifelines. No one gets home alone.” |

## Reproducible recording setup

1. `npm ci && npm run build`, then `npm start`.
2. Open `http://localhost:3001`. Reset the mission.
3. Enable **Simulated crew** and **Training pilot** for rehearsal. The default seed completes all three pods in about 77 seconds.
4. To demonstrate manual contribution, turn simulated crew off briefly and send a command as a named simulated viewer. This must remain labeled as simulated.
5. For a live recording, use **Connect Twitch → Join live chat**, switch to **Twitch live**, and have at least three distinct accounts participate. Pilot manually; training controls cannot inject simulated activity into live missions. Viewers can precharge shields and engines before launch.
6. Capture the full console for setup and the 1920×1080 `/overlay` view for the flight. Both views observe the same server state.
7. Record a spare successful rehearsal before experimenting with live setup. Keep the core mission uncut or mark any time compression clearly.
8. Export H.264/AAC MP4. Check duration with `ffprobe`, watch the entire export, confirm labels and legibility, then upload to YouTube with visibility **Public**. Verify the link in an incognito window.

Do not record secrets, `.env`, access tokens, the OAuth callback URL, or developer-console credential screens. Show the connection status rather than the secret setup process.

## Prepared MP4

`artifacts/demo/last-signal-demo.mp4` is a **2:32, 1920×1080, 30 fps H.264/AAC** export of the working rehearsal. It includes the complete recorded mission, an actual local connection screen, explanatory title cards, synthesized draft narration, and an English subtitle track. `last-signal-demo.srt` is also available separately. Replace the draft voice with the team's narration for a more personal submission.

Reproduce it with `npm run test:e2e` (records the complete mission), `powershell -File scripts/narrate-demo.ps1`, `node scripts/build-demo.mjs`, and `node scripts/caption-demo.mjs`. FFmpeg and FFprobe must be on PATH for the last two steps. Keep a local server running at port 3001 for the connection screenshot.
