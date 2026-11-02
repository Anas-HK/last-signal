import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type WebSocket from "ws";
import { AnonymousChat, parseIrc } from "../server/irc.js";
import { Game } from "../server/game.js";
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

test("IRC command fixtures reach live game physics with real-source attribution and reject simulated input", async () => {
  const socket = new FakeSocket();
  const game = new Game();
  game.reset("live");
  const status: TwitchStatus = {
    status: "connecting", channel: "channel", account: "Anonymous read-only",
    received: 0, lastMessageAt: null, error: "", configured: false, transport: "irc",
  };
  const irc = new AnonymousChat({
    channel: "channel", status,
    socket: () => socket as unknown as WebSocket,
    onCommand: (id, name, command) => game.chat(`twitch-${id}`, name, command, false),
  });
  let serial = 0;
  const send = (id: string, command: string) => socket.message(
    `@id=fixture-${++serial};user-id=${id};display-name=Viewer${id} :viewer${id}!v@h PRIVMSG #channel :!${command}\r\n`,
  );
  try {
    const ready = irc.connect();
    socket.emit("open");
    socket.message("@room-id=123 :tmi.twitch.tv ROOMSTATE #channel\r\n");
    await ready;
    send("1", "join");
    send("2", "boost go");
    assert.equal(game.state.crew[0].name, "Viewer1");
    assert.equal(game.state.ship.boost, 22);
    game.start();
    for (let i = 0; i < 95; i++) game.tick(1 / 30);
    game.state.ship.hull = 60;
    send("3", "shield");
    send("4", "repair");
    assert.ok(game.state.ship.hull > 67);
    send("5", "drop");
    send("6", "meteor incoming");
    assert.equal(game.state.drops[0].owner, "Viewer5");
    assert.equal(game.state.meteors[0].owner, "Viewer6");
    assert.ok(game.state.meteors[0].warn > 0);
    assert.ok(game.state.crew.every((c) => !c.simulated));
    assert.ok(game.history.filter((e) => e.type === "drop" || e.type === "meteor").every((e) => e.simulated === false));
    assert.equal(game.chat("sim", "Simulated", "drop", true).accepted, false);
    assert.equal(game.chat("sim", "Simulated", "meteor", true).accepted, false);
    send("5", "drop");
    send("6", "meteor");
    assert.equal(game.state.drops.length, 1);
    assert.equal(game.state.meteors.length, 1);
    game.pause();
    send("7", "drop");
    assert.equal(game.state.drops.length, 1);
    game.reset("live");
    assert.equal(game.state.drops.length, 0);
    assert.equal(game.state.meteors.length, 0);
    assert.equal(game.state.ship.powerup, null);
  } finally {
    irc.disconnect();
  }
});
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
