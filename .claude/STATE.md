# Last Signal
Cooperative Twitch space-rescue game for the Codex x TwitchCon hackathon: the streamer flies and fights, Twitch chat crews the ship, sends power-up crates and throws meteors.

## Active goal
Get the submission ready: the gameplay update has landed (pilot weapons, chat crates and meteors). Remaining: a real-Twitch test of `!drop` and `!meteor`, a fresh demo video, and the Devpost submission.

## Done so far (this iteration)
- Codex built the original product: game engine, Twitch anonymous IRC and OAuth/EventSub adapters, OBS overlay, React console, tests, CI, README, demo MP4 (commits 2dcdc13, f8eee0a; Codex session `01a19ccf-e07f-7e72-9a32-fcae9d50c948`, see docs/CODEX_SESSION.md).
- Claude polish, 2026-11-02 (see sessions/2026-11-02-hackathon-polish-gameplay.md §1):
  - 53ee90e: `!join` lobby, visible throttled rejections, crew-scaled debris, OAuth return to the starting origin plus connection confirmation, Host allowlist, control key only for loopback consoles, full mission log, 30 Hz snapshots.
  - 011b269: synthesized soundtrack and effects, dead-reckoned steering, afterburner, results cards, readability.
  - 093b360: decluttered HUD into four cards; help and results rebuilt as cards.
  - be64b99: Space laser with heat, Shift dash fuelled by `!boost`, E fires power-ups from `!drop` crates (nova, bubble, overdrive), `!meteor` named meteors with warning lines, debris walls, storm comets.
  - 465442a + 5a62885: Codex's screenshot refresh saved, then merged; main == polish-sprint content.
- Real Twitch (anonymous IRC, `#anashk123`, about 16:40 UTC 2026-11-02, on the 011b269 code): `!join`, `!boost go`, `!repair` from viewer `anashk999` all arrived and behaved (see journal §1). `!drop` and `!meteor` have NOT been tested with real chat.
- Checks on the code committed as be64b99 (2026-11-02): typecheck, production build, 31/31 engine tests, 7/7 Playwright browser tests (run with `E2E_PORT=3302`).

## Next step
Restart the game server on port 3001 so it runs the new code (stop the running `npm start`, then `npm run build && npm start`), then have a real Twitch account send `!drop` and `!meteor` in `#anashk123` during a live mission and confirm the crate and meteor appear with the viewer's name.

## Open questions
- OAuth/EventSub was never tested live: no registered Twitch app (app registration was blocked by account 2FA, per docs/CODEX_SESSION.md).
- Demo video: `artifacts/demo/last-signal-demo.mp4` predates every Claude change; the README has a YouTube placeholder. Re-record and upload as Public.
- Balance figures are bot-pilot simulations, not human playtests (numbers and basis in journal §1).
- Phone layout still crops the flight view's edge text (pre-existing, low priority).

## Working notes
- Codex may still be active in this folder. Claude worked in a git worktree at `C:\Projects\Hackathon\Codex hackathon-polish` (branch `polish-sprint`) with its own ports: server 3201, browser tests `E2E_PORT=3302`. Remove it when done: `git worktree remove "../Codex hackathon-polish"`.
- Do not kill the server on port 3001 without asking: it is Codex's/Anas's and may hold a live Twitch connection.
- Visual checks: a headed Playwright window hidden behind other windows throttles animation and screenshots lag by seconds; capture with headless Chromium instead (journal §1).
- Commits are authored as Anas-HK with no AI co-author trailers (user rule).
- Hackathon rule: must connect to Twitch and be built with OpenAI Codex. Codex read the Devpost rules and found AI coding assistants permitted (journal §1).

## Last updated
2026-11-02 by session segment 1, slug: hackathon-polish-gameplay
