import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type WebSocket from "ws";
import { AnonymousChat, parseIrc } from "../server/irc.js";
import type { TwitchStatus } from "../shared/types.js";
class FakeSocket extends EventEmitter {
  sent: string[] = [];
  send(s: string) {
    this.sent.push(s);
  }
  close() {
    this.emit("close");
  }
  terminate() {
    this.close();
  }
  message(s: string) {
    this.emit("message", Buffer.from(s));
  }
}
test("IRC parser handles tags, escaped names, prefixes and trailing message content", () => {
  const m = parseIrc(
    "@id=a;display-name=Space\\sCadet;user-id=42 :viewer!viewer@host PRIVMSG #channel :!shield please",
  );
  assert.equal(m?.tags["display-name"], "Space Cadet");
  assert.equal(m?.command, "PRIVMSG");
  assert.deepEqual(m?.params, ["#channel"]);
  assert.equal(m?.text, "!shield please");
  assert.equal(parseIrc("PING :tmi.twitch.tv")?.text, "tmi.twitch.tv");
  assert.equal(parseIrc(""), null);
});
test("anonymous IRC handshake confirms a real room, reads commands, handles fragmented frames and deduplicates", async () => {
  const socket = new FakeSocket();
  const status: TwitchStatus = {
    status: "connecting",
    channel: "channel",
    account: "Anonymous read-only",
    received: 0,
    lastMessageAt: null,
    error: "",
    configured: false,
    transport: "irc",
  };
  const commands: unknown[][] = [];
  const irc = new AnonymousChat({
    channel: "channel",
    status,
    onCommand: (...args) => commands.push(args),
    socket: () => socket as unknown as WebSocket,
  });
  try {
    const ready = irc.connect();
    socket.emit("open");
    assert.ok(socket.sent.some((s) => s === "JOIN #channel\r\n"));
    socket.message("@room-id=123 :tmi.twitch.tv ROOMSTATE #channel\r\n");
    await ready;
    assert.equal(status.status, "connected");
    socket.message("PING :tmi.twitch.tv\r\n");
    assert.ok(socket.sent.includes("PONG :tmi.twitch.tv\r\n"));
    socket.message("@id=one;user-id=99;display-name=Viewer :viewer!v@h PRIV");
    socket.message("MSG #channel :!shield\r\n");
    socket.message(
      "@id=one;user-id=99;display-name=Viewer :viewer!v@h PRIVMSG #channel :!shield\r\n",
    );
    socket.message(
      "@id=other;user-id=99;display-name=Viewer :viewer!v@h PRIVMSG #wrong :!repair\r\n",
    );
    assert.deepEqual(commands, [["99", "Viewer", "shield"]]);
    assert.equal(status.received, 1);
    assert.ok(socket.sent.every((s) => !s.startsWith("PRIVMSG")));
  } finally {
    irc.disconnect();
  }
});
