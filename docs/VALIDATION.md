# Validation record

Latest live verification: at 19:11 UTC, viewer `anashk999` sent join, boost, drop and meteor in `#anashk123`; all four were accepted by the live game, and the named bubble-shield crate was caught. The revised videos show these actual messages and the four-message connection confirmation. See the real Twitch recording section below for details.

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

**Remaining boundaries:** OAuth/EventSub authorization remains unverified with a registered app. The OBS browser view is verified; this run did not operate the OBS desktop application. Mobile has no touch-flight controller, and the narrow flight view crops some edge labels. These limits are not presented as completed live testing.

## Earlier live viewer verification

On 2026-11-02, anonymous IRC connected to the actual Twitch channel and received viewer commands. Join and boost reached the game; shield behavior was confirmed in live testing. A repair command sent with a full hull was correctly rejected with an on-screen reason. Viewer names appeared in the lobby and crew activity. This earlier evidence does not verify the subsequently added drop and meteor commands.

## Gameplay showcase exports

A separate recording on isolated port 3304 used automated keyboard control with the built-in training pilot disabled and labeled simulated chat. It won in 92 seconds with all 13 survivors, 84 crew actions, five shield blocks and 11 ALL HANDS pulses. Nova, bubble and overdrive were caught and used. Canvas frames and the game music/effects were recorded together using MediaRecorder.

The initial 108.3-second showcase exports provided: Grady neural narration plus game audio, and embedded captions plus game audio without narration. Captions are embedded below the HUD. The Grady voice is AI-generated using Seed Audio 1.0 through Higgsfield. Narration segments are checked for overlap and kept inside the runtime. The exports use peak limiting, and the narration mix ducks game audio during speech. The result image is from the same mission after its count animation completes. The later revision appends actual live Twitch evidence and a confirmed connection, and delivers at 60 fps.

Both final exports decoded without errors. Sampled frames confirmed the nova clear, bubble shield, triple lasers, caption placement and 13/13 result card. Decoded audio peaks measured -2.8 dBFS without narration and -3.3 dBFS with narration, leaving headroom below clipping. Both have H.264 video at 1920x1080 and AAC audio. Files and gallery screenshots are attached to the GitHub release.

## Real Twitch command recording

At 19:11 UTC on 2026-11-02, actual Twitch viewer `anashk999` sent `!join`, `!boost`, `!drop`, and `!meteor` in `#anashk123`. The live adapter accepted all four commands. The game spawned the named bubble-shield crate and meteor; the crate was caught and the viewer credited. The recorded live mission was in live mode with simulation and training pilot disabled, and finished with all 13 survivors. The connection dialog confirmed four real received messages. Exact command receipts and mission events are preserved locally in `artifacts/live-proof/recording.json`.

The revised videos include a separate real-Twitch segment and the connection confirmation. Rehearsal command visualization is labeled simulated; the actual Twitch segment displays only commands received from Twitch. The latest capture was recorded at 1920x1080 and encoded at 60 fps without motion interpolation, preserving the original gameplay detail and keeping chat text sharp.

## Sharp capture and steering revision

The latest main showcase was re-recorded at 1920x1080 using a high-resolution canvas in a headed browser, with capture separated from encoding. The recorded compositor averaged 58.18 fps including the ending screenshots; the 95th-percentile frame gap was 16.8 ms. Gameplay logging confirmed all four keys were used: W 103, S 109, A 187, D 183 controller samples. Ship X ranged from 85 to 611 and Y from 85 to 577. The mission recovered all 13 survivors and demonstrated nova, bubble and overdrive.

The low-resolution motion-interpolation stage was removed. The voiceover version uses a clean master with no added subtitles in either the rehearsal or real Twitch segment. The separate version without narration retains embedded captions. Both retain game audio and the actual Twitch command/connection proof.
