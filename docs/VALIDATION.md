# Validation record

Date: 2026-11-02. Windows, Node.js 24.22.1.

## Automated checks

- Strict TypeScript checks and Vite production build pass.
- **18/18 engine and Twitch adapter tests pass.**
- Deterministic rehearsal verifies three recovered pods, 13 survivors, real shield blocks, accepted crew contributions, and completion before the two-minute deadline.
- ALL HANDS tests verify three distinct identities, expired-link rejection, contribution points, and the expanded physical rescue radius.
- Twitch adapter tests use disclosed fixtures: OAuth scope checks, official subscription body, notification routing, channel filtering, deduplication, reconnect migration without duplicate subscriptions, and unsafe reconnect URL rejection.
- **3/3 Playwright browser tests pass**, including a full real-time rescue with 13 survivors, synchronized OBS results, actual keyboard motion, manual simulated viewer action, pause/reset, setup dialogs, mobile overflow, and rejection of unauthorized mutations. The run completed in 1.9 minutes.

## Twitch live status

**Credential-free live IRC connection and real message reception: verified. User reports boost and shield working. OAuth/EventSub authorization: pending app credentials.**

On 2026-11-02, Twitch's actual `wss://irc-ws.chat.twitch.tv:443` endpoint accepted an anonymous read-only connection to `anashk123`, returned `JOIN`, numeric `366`, and `ROOMSTATE` with room ID `1603913962`. The app's own connection flow also joined successfully and displayed **Twitch IRC · read-only**. No client ID or secret was used. The IRC parser and fragmented-frame/deduplication tests pass.

At approximately 15:57 UTC the game's own Twitch adapter showed **2 real messages received**. An independent listener captured `anashk999` sending `!boost` to `#anashk123`. Earlier commands arrived after a mission had ended and were rejected by the game lifecycle; the UI was improved to show explicit rejection reasons and to accept crew precharging on the ready screen. At approximately 16:00 UTC the user confirmed “Its working now booost and shield,” then requested a more visible boost effect. Boost now accelerates from 53 to 105 world units/s, has an authoritative velocity readout and longer engine/streak effects, and is verified by a physics test. An accepted live-crew snapshot, when captured, is saved as `live-validation.json`; absence of that file must not be described as captured engine-level live proof.

GitHub CI for the initial source push passed: https://github.com/Anas-HK/last-signal/actions/runs/41475666412 . The latest local browser suite also passed all three journeys, including a complete rescue and ALL HANDS. A real-time recording was exported as a 2:32 rehearsal demonstration with explicit simulated-source labels and synthesized draft narration.

The real official endpoint `wss://eventsub.wss.twitch.tv/ws` was reached on **2026-11-02 at 15:35:18 UTC** and returned `session_welcome` with a 10-second keepalive. That proves transport reachability only. It does not prove an authorized subscription or message from a real channel.

### Live validation procedure

1. Use **Connect Twitch → Join live chat** with a channel name; alternatively configure and authorize the optional EventSub connection.
2. Confirm the crew panel reports the selected transport connected.
3. Launch a mission. After countdown, send `!shield` in the selected channel using a real viewer account.
4. Confirm the dialog's real-message count increases, the viewer name appears in crew activity, shields increase, and the named drone appears.
5. Send the same command within two seconds and verify no second effective action.
6. Have two other real users supply boost and repair, while hull is below capacity. Confirm ALL HANDS and the named contributors.
7. Open `/overlay`; verify the same mission and real source label.
8. Record the channel, date, commands and observed results here, without credentials.

## Honest demonstration boundaries

Rehearsal bots and manually entered names are simulated. The same game rules apply to both sources, but a live mission rejects simulated input. No simulation is presented as Twitch chat. Screenshots and the demo are captures of the working game, not substitutes for it.

## Polish pass verification (2026-11-02)

- Strict TypeScript and the Vite production build pass. 25/25 engine and Twitch adapter tests pass, including new tests for `!join`, countdown precharge, throttled rejection notices, the complete mission history, crew-scaled debris and the afterburner.
- 6/6 Playwright browser tests pass on an isolated port (`E2E_PORT=3302`): the three original journeys plus lobby boarding with rejections, countdown precharge, afterburner and full log export; sound and music controls; and the control-key, Host allowlist and OAuth return checks. All viewers in these tests are labelled simulated viewers.
- Real Twitch, read-only IRC: at about 16:40 UTC a separate test instance joined `#anashk123` (Twitch confirmed the room in about 3 seconds). Real viewer `anashk999` sent `!join` (boarded, assigned the SHIELDS station), `!boost go` (engines precharged to 22%) and `!repair` (rejected on screen: hull already full). The OBS view showed the real name in the lobby, ticker and crew drone, and the precharged boost carried into launch.
- Not verified live: OAuth/EventSub (no registered app), and raids or other Twitch events (not implemented).

## Gameplay update verification (2026-11-02)

- New mechanics: pilot laser with heat, Shift dash fuelled by `!boost`, `!drop` power-up crates (nova, bubble, overdrive) caught by the pilot and fired with E, `!meteor` named meteors with warning lines, debris walls and storm comets.
- 31/31 engine tests pass, including laser hits and cracking, overheating, dash ramming, crate catch and nova clear, meteor warning, shoot-down and hit attribution, and the reproducible rehearsal win (all 13 survivors in about 106 seconds).
- 7/7 Playwright browser tests pass on an isolated port, including a new journey that fires the laser, dashes, sends a crate and a meteor through the console, and pauses with P. All viewers in browser tests are labelled simulated viewers.
- Not yet verified with real Twitch chat: `!drop` and `!meteor` (they use the same verified chat path as `!join` and `!boost`).
