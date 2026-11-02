# Validation record

Date: 2026-11-02. Windows, Node.js 24.22.1.

## Automated checks

- Strict TypeScript checks and Vite production build pass.
- **16/16 engine and Twitch adapter tests pass.**
- Deterministic rehearsal verifies three recovered pods, 13 survivors, real shield blocks, accepted crew contributions, and completion before the two-minute deadline.
- ALL HANDS tests verify three distinct identities, expired-link rejection, contribution points, and the expanded physical rescue radius.
- Twitch adapter tests use disclosed fixtures: OAuth scope checks, official subscription body, notification routing, channel filtering, deduplication, reconnect migration without duplicate subscriptions, and unsafe reconnect URL rejection.
- **3/3 Playwright browser tests pass**, including a full real-time rescue with 13 survivors, synchronized OBS results, actual keyboard motion, manual simulated viewer action, pause/reset, setup dialogs, mobile overflow, and rejection of unauthorized mutations. The run completed in 1.9 minutes.

## Twitch live status

**Credential-free live IRC channel connection: verified. Real channel-command validation: waiting for a viewer message. OAuth/EventSub authorization: pending app credentials.**

On 2026-11-02, Twitch's actual `wss://irc-ws.chat.twitch.tv:443` endpoint accepted an anonymous read-only connection to `anashk123`, returned `JOIN`, numeric `366`, and `ROOMSTATE` with room ID `1603913962`. The app's own connection flow also joined successfully and displayed **Twitch IRC · read-only**. No client ID or secret was used. The IRC parser and fragmented-frame/deduplication tests pass.

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
