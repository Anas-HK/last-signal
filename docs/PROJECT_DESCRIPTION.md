# LAST SIGNAL

**You fly. Chat keeps you alive.**

LAST SIGNAL turns Twitch chat into the crew of a rescue spaceship. The streamer pilots through a debris field while viewers power shields, boost the engines, and repair the hull with three simple chat commands. Every contributor becomes a named drone around the ship and earns a place in the mission credits.

The twist is **ALL HANDS**: three different viewers coordinate three stations within six seconds to create a rescue pulse, nearly doubling tractor range. Success is something the streamer and community make together, rather than a poll result or a chatbot reply.

The two-minute mission creates a repeatable community ritual between games, during a break, or as its own on-stream challenge. Recover three drifting escape pods, bring 13 survivors through the jump gate, and credit the viewers who kept the ship alive. One late shield can turn a collision into a rescue story.

The working implementation includes real movement and collisions, a shared-resource economy, anti-spam limits, individually credited contributions, procedural space art, optional sound, an OBS spectator view, and downloadable mission logs. Twitch integration works through credential-free, read-only IRC, with OAuth and EventSub also available. No message-sending permission or paid service is needed. A separately labeled rehearsal mode lets anyone try the actual game offline.

OpenAI Codex chose and scoped the concept, implemented the TypeScript game and Twitch adapter, authored the Canvas renderer and React interface, wrote and ran automated tests, debugged UI latency and mission behavior, and prepared the repository and demo materials. The session ID and development record are included in the repository.

## Short submission blurb

One pilot. A whole chat of lifelines. LAST SIGNAL is a Twitch co-op rescue where viewers become named spaceship crew. Type `!shield`, `!boost`, or `!repair` to keep the streamer alive; coordinate three viewers across three stations to trigger ALL HANDS and pull survivors out of danger. Real physics, a two-minute mission, OBS broadcast view, and credits for the people who brought everyone home. Built with OpenAI Codex.

## Implementation status

Use the exact current integration status in `VALIDATION.md`. Do not describe fixture tests, simulated crew, or an unauthenticated WebSocket handshake as a tested live chat connection.
