# Demo videos

Two 1080p H.264/AAC exports are available in the GitHub release:

- `last-signal-voiceover-game-audio.mp4`: Grady neural narration, embedded captions, game music and effects. The narration uses Seed Audio 1.0 through Higgsfield and is AI-generated.
- `last-signal-captions-game-audio.mp4`: embedded captions, game music and effects, with no narration.

Both run for approximately 1:48. Captions occupy a separate lower band, keeping the flight HUD visible. Music ducks under narration in the voiceover version. The gameplay is continuous, followed by the result card from the same mission. The recording rescued all 13 survivors and shows nova bomb, bubble shield and overdrive guns being caught and fired, plus laser fire, dashes, named meteors and ALL HANDS.

The footage uses labeled simulated chat and automated keyboard control with the built-in training pilot disabled. It is a capture of the actual game and its Web Audio output, not a rendered or scripted game outcome. No live viewer-message claim is made for this recording.

## Reproduce the recording and exports

1. Build the app, then start an isolated server: `node --import tsx server/index.ts --port 3304 --app-url http://localhost:3304`.
2. Run `node scripts/record-showcase.mjs`. It records real Canvas frames and Web Audio into one synchronized stream and saves mission evidence in `artifacts/showcase/recording.json`.
3. Run `node scripts/export-showcase.mjs` to generate the version without narration. It creates embedded captions and a sidecar SRT, normalizes game audio and limits peaks.
4. With licensed/generated Grady WAV segments saved as `artifacts/showcase/voice/0.wav` through `8.wav`, run `node scripts/mix-showcase-voice.mjs` for the voiceover version. The mixer checks speech timing, ducks game audio during speech, and limits the final mix.

The recording harness fails if all three power-ups are not demonstrated. Keep the rehearsal label visible. Inspect both exports, then upload the preferred version to YouTube as Public and check the URL while signed out.
