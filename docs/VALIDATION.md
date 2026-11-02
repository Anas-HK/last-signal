# Validation record

## Final submission verification (2026-11-02)

Windows, Node.js 24.22.2, Chromium 156 (Playwright 1.64.1), isolated server on port 3302. The existing server on port 3001 was left untouched.

- Clean dependency install: 200 packages audited, zero reported vulnerabilities.
- Strict TypeScript check and production build pass on Node 24; also passed on the installed Node 22.16.0.
- **34/34 engine and adapter tests pass.** Added bubble protection/expiry, overdrive triple shots/expiry, and IRC fixtures routed into live-mode physics for all six commands. Fixtures verify owner attribution, cooldown rejection, pause/reset behavior, and rejection of simulated input.
- **11/11 browser journeys pass, including the opt-in actual Twitch connection check.** Coverage includes keyboard laser and dash, named crates and meteors, keyboard steering into a crate, E to fire it, viewer points, paused reload recovery, sound/music scheduling, help, OBS setup, silent spectator audio, mobile overflow, invalid API requests, Host/origin checks, and control permissions.
- Complete real-time rehearsal: **won in 106 seconds, three pods, 13 survivors, 47 crew actions, six shield blocks, 17 hull repaired, four ALL HANDS pulses.** OBS showed the same result. The mission report is saved at `artifacts/validation/final-mission.json`; fresh screenshots and a full raw rehearsal recording were produced.
- Real Twitch UI check: `#anashk123` joined through the actual console using anonymous read-only IRC. Live launch succeeded; simulated drop/meteor commands were rejected; disconnect paused the live mission. This check received **zero viewer messages**. Evidence: `artifacts/validation/live-ui.json` and `live-connected.png`.
- Standalone read-only handshake also passed at 18:05:50 UTC; evidence: `artifacts/validation/twitch-handshake.json`.
- After adding the GitHub source link to the game footer, two targeted browser journeys passed for the link/help/OBS flow and mobile layout. That run also rebuilt and typechecked the updated application.

Reproduce with `npm ci`, `npm test`, `npm run build`, `npx playwright install chromium`, and `npm run test:e2e`. Set `E2E_PORT=3302` for isolation and `VERIFY_TWITCH_CHANNEL=anashk123` to include the actual-network journey; otherwise that journey is skipped. Browser run output is saved locally in `final-browser-tests.log`.

**Remaining boundaries:** viewer-sent `!drop` and `!meteor` are not verified against real chat in the final verification run. Their command parsing, live-mode engine routing and physics are fixture-tested, and their browser controls work in labeled rehearsal. OAuth/EventSub authorization remains unverified with a registered app. The OBS browser view is verified; this run did not operate the OBS desktop application. Mobile has no touch-flight controller, and the narrow flight view crops some edge labels. These limits are not presented as completed live testing.

## Earlier live viewer verification

On 2026-11-02, anonymous IRC connected to the actual Twitch channel and received viewer commands. Join and boost reached the game; shield behavior was confirmed in live testing. A repair command sent with a full hull was correctly rejected with an on-screen reason. Viewer names appeared in the lobby and crew activity. This earlier evidence does not verify the subsequently added drop and meteor commands.

## Gameplay showcase exports

A separate recording on isolated port 3304 used automated keyboard control with the built-in training pilot disabled and labeled simulated chat. It won in 92 seconds with all 13 survivors, 84 crew actions, five shield blocks and 11 ALL HANDS pulses. Nova, bubble and overdrive were caught and used. Canvas frames and the game music/effects were recorded together using MediaRecorder.

Two approximately 108.3-second 1080p exports are provided: Grady neural narration plus game audio, and embedded captions plus game audio without narration. Captions are embedded below the HUD. The Grady voice is AI-generated using Seed Audio 1.0 through Higgsfield. Narration segments are checked for overlap and kept inside the runtime. The exports use peak limiting, and the narration mix ducks game audio during speech. The result image is from the same mission after its count animation completes.

Both final exports decoded without errors. Sampled frames confirmed the nova clear, bubble shield, triple lasers, caption placement and 13/13 result card. Decoded audio peaks measured -2.8 dBFS without narration and -3.3 dBFS with narration, leaving headroom below clipping. Both have H.264 video at 1920x1080 and AAC audio. Files and gallery screenshots are attached to the GitHub release.
