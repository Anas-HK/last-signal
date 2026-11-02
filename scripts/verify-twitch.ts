// Opt-in read-only check against the actual Twitch service. Sends no chat messages.
// Usage: npx tsx scripts/verify-twitch.ts channel_name
import { mkdirSync, writeFileSync } from "node:fs";
import { Twitch } from "../server/twitch.js";

const channel = process.argv[2];
if (!channel) throw new Error("Provide the Twitch channel name to verify.");
const twitch = new Twitch({
  clientId: "", clientSecret: "", redirectUri: "http://localhost/auth/twitch/callback",
  onCommand: () => {},
});
try {
  await twitch.connectAnonymous(channel);
  if (twitch.status.status !== "connected") throw new Error("Channel join was not confirmed.");
  const evidence = {
    checkedAt: new Date().toISOString(),
    scope: "Actual read-only Twitch room handshake only; no viewer command verification",
    status: twitch.status,
  };
  mkdirSync("artifacts/validation", { recursive: true });
  writeFileSync("artifacts/validation/twitch-handshake.json", JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  twitch.disconnect();
}
