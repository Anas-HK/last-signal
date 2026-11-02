# Sprint log

Started 2026-11-02 ~20:06 Asia/Karachi. Budget: approximately 7 hours.
Codex session: `01a19ccf-e07f-7e72-9a32-fcae9d50c948` (captured from CODEX_SESSION_ID; confirm with /status before submission).

## Decision (within first 15 minutes)

| Concept | Originality | Entertainment | Streamer value | Twitch fit | Demo | Feasible |
|---|---|---|---|---|---|---|
| Last Signal: streamer pilots, chat keeps rescue ship alive | High | High | Shared community ritual | Excellent | Excellent | High |
| Audience assembles a boss | Medium | High | Recurring minigame | Excellent | High | High |
| Chat builds an endless escape route | High | High | Break entertainment | Excellent | High | Medium |
| Collaborative stream mystery | Medium | Medium | Audience retention | Good | Medium | High |

Selected **Last Signal**. A cooperative game with asymmetric roles, individually credited actions, and a rescue finale. No AI inference or paid services needed to run; Codex engineers the actual product.

## Architecture

React + TypeScript + Vite. Node/Express + ws authoritative game at 30Hz; broadcasts at 15Hz. Canvas rendering with browser interpolation. Twitch OAuth authorization code flow, tokens in server memory, EventSub channel.chat.message. Same command path for clearly labeled simulated chat and real chat. Browser source mirrors server state. No external game engine or database.

## Validation policy

Report live integration as unverified until an authorized channel message has reached the game. Test fixtures are marked fixtures, not real chat. Rehearsal mode remains labeled in game and broadcast views.

## 20:50 update (~6h15 remaining)

Core product, procedural visuals, individual crew actions, ALL HANDS, OBS, docs and the full demo mission work. 16 unit/adapter tests and the full browser suite pass. Twitch application registration hit a user-account 2FA block, so a read-only anonymous IRC compatibility path was tested against the real service and added to the product. The live app is connected to anashk123; awaiting a viewer command to complete end-to-end verification. OAuth/EventSub remains implemented and fixture-tested.

## 21:15 update (~5h50 remaining)

Working rescue, keyless Twitch IRC, 18 engine/adapter tests, 3 browser journeys, and initial remote CI all pass. Real channel messages reached the adapter; user reported boost/shield working. Their feedback prompted stronger physics (53→105), authoritative speed HUD, clear shield-impact feedback, crew precharging, and rejection reasons. Recorded and encoded a 2:32 1080p rehearsal MP4 with captions and draft speech. Source is public at github.com/Anas-HK/last-signal. User will review and upload the public YouTube video personally. Session ID and all submission text are documented.
