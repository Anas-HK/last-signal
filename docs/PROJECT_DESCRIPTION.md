# LAST SIGNAL

**You fly. Chat keeps you alive.**

LAST SIGNAL turns Twitch chat into the crew of a rescue spaceship. The streamer flies, fires a laser, and dashes through a debris field while viewers power shields, fill the dash tank, and repair the hull. Viewers type `!join` to board, `!drop` to send a named power-up crate, or `!meteor` to throw a meteor at the pilot. Catch a crate and press E to unleash a nova bomb, bubble shield, or overdrive guns. Crew contributions and meteor throws carry the viewer's name.

The twist is **ALL HANDS**: three different viewers coordinate three stations within six seconds to create a rescue pulse, nearly doubling tractor range. Success is something the streamer and community make together, rather than a poll result or a chatbot reply.

The two-minute mission creates a repeatable community ritual between games, during a break, or as its own on-stream challenge. Recover three drifting escape pods, bring 13 survivors through the jump gate, and credit the viewers who kept the ship alive. One late shield can turn a collision into a rescue story.

The working implementation includes real movement and collisions, laser heat, pilot-controlled dash fuel, debris walls with gaps, storm comets, crew-scaled difficulty, anti-spam limits, individually credited contributions, procedural space art, synthesized music and effects, an OBS spectator view, and downloadable mission logs. Twitch integration works through credential-free, read-only IRC. OAuth and EventSub are implemented as an optional path and fixture-tested; authorization has not been verified with a registered app. No message-sending permission or paid service is needed. A separately labeled rehearsal mode lets anyone try the actual game without Twitch credentials.

OpenAI Codex chose and scoped the concept, implemented the TypeScript game and Twitch adapter, authored the Canvas renderer and React interface, wrote and ran automated tests, debugged UI latency and mission behavior, and prepared the repository and demo materials. The session ID and development record are included in the repository.

## Short submission blurb

One pilot. A whole chat of lifelines. Fly, shoot, and dash while Twitch viewers shield and repair your ship, fuel your dash, send power-up crates, or throw named meteors. Coordinate three viewers for an ALL HANDS rescue pulse. Bring 13 survivors home before the two-minute jump window closes, then credit the crew who made it happen. Built with OpenAI Codex.

## Implementation status

Use the exact current integration status in `VALIDATION.md`. Do not describe fixture tests, simulated crew, or an unauthenticated WebSocket handshake as a tested live chat connection.
