# Demo script — current export 2:48, hard limit 2:59

## Current gameplay export (2026-11-02)

The current `artifacts/demo/last-signal-demo.mp4` is a fresh 168.2-second export, replacing the earlier pre-polish video. It shows the lobby, named meteor/crate screenshot, keyboard-driven crate pickup and E activation, a complete uncut rescue, a real Twitch connection screenshot, and the results. Rehearsal source labels remain visible. Narration is synthesized offline; game sound/music is not captured in this export.

The rescue segment starts at 00:24.16, the real connection screenshot at 02:23.20, and the closing result at 02:34.20. The connection capture received zero messages; do not describe it as viewer-command evidence. The full timeline is saved in `artifacts/demo/timeline.json`, and narration text in `narration.json`.

Rebuild after running all browser journeys with `VERIFY_TWITCH_CHANNEL` enabled: `node scripts/build-submission.mjs`, then `node scripts/caption-demo.mjs`. These require FFmpeg/FFprobe and Windows System.Speech with Microsoft Zira Desktop. The exporter checks narration timing, preserves the entire rescue recording, and rejects a total duration of three minutes or more. `scripts/build-demo.mjs` forwards to the current exporter.

Upload copy and gallery captions are in `GALLERY.md`. Upload the MP4 as Public on YouTube and check the link while signed out.
