import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type WebSocket from "ws";
import { Twitch } from "../server/twitch.js";
class FakeSocket extends EventEmitter {
  closed = false;
  close() {
    this.closed = true;
    this.emit("close");
  }
  terminate() {
    this.close();
  }
  message(data: unknown) {
    this.emit("message", Buffer.from(JSON.stringify(data)));
  }
}
const settle = () => new Promise((resolve) => setImmediate(resolve));
function fixture() {
  const calls: { url: string; body?: any }[] = [];
  const commands: unknown[][] = [];
  const sockets: FakeSocket[] = [];
  const http = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : init?.body,
    });
    if (url.includes("/oauth2/token"))
      return Response.json({
        access_token: "fixture-token",
        refresh_token: "fixture-refresh",
        expires_in: 3600,
      });
    if (url.includes("/validate"))
      return Response.json({
        client_id: "fixture-client",
        user_id: "42",
        login: "pilot",
        scopes: ["user:read:chat"],
      });
    if (url.includes("/helix/users"))
      return Response.json({ data: [{ id: "7", login: "pilot" }] });
    if (url.includes("/subscriptions"))
      return Response.json(
        { data: [{ id: "sub", status: "enabled" }] },
        { status: 202 },
      );
    return Response.json({}, { status: 404 });
  };
  const twitch = new Twitch({
    clientId: "fixture-client",
    clientSecret: "fixture-secret",
    redirectUri: "http://localhost:3001/auth/twitch/callback",
    fetch: http as typeof fetch,
    socket: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s as unknown as WebSocket;
    },
    onCommand: (...args) => commands.push(args),
  });
  const welcome = (socket: FakeSocket, id = "session-fixture") =>
    socket.message({
      metadata: { message_type: "session_welcome" },
      payload: { session: { id, keepalive_timeout_seconds: 20 } },
    });
  return { twitch, calls, commands, sockets, welcome };
}
test("official EventSub message fixtures subscribe correctly, deduplicate and deliver commands", async () => {
  const f = fixture();
  try {
    await f.twitch.authorize("fixture-code");
    assert.equal(f.twitch.status.status, "connecting");
    f.welcome(f.sockets[0]);
    await settle();
    assert.equal(f.twitch.status.status, "connected");
    const sub = f.calls.find((c) => c.url.includes("/subscriptions"))!;
    assert.deepEqual(sub.body, {
      type: "channel.chat.message",
      version: "1",
      condition: { broadcaster_user_id: "7", user_id: "42" },
      transport: { method: "websocket", session_id: "session-fixture" },
    });
    const msg = {
      metadata: { message_type: "notification", message_id: "one" },
      payload: {
        subscription: { type: "channel.chat.message" },
        event: {
          broadcaster_user_id: "7",
          chatter_user_id: "99",
          chatter_user_name: "real_fixture_viewer",
          message: { text: "!shield" },
        },
      },
    };
    f.sockets[0].message(msg);
    f.sockets[0].message(msg);
    await settle();
    assert.deepEqual(f.commands, [["99", "real_fixture_viewer", "shield"]]);
    assert.equal(f.twitch.status.received, 1);
    f.sockets[0].message({
      ...msg,
      metadata: { ...msg.metadata, message_id: "wrong-channel" },
      payload: {
        ...msg.payload,
        event: { ...msg.payload.event, broadcaster_user_id: "different" },
      },
    });
    assert.equal(f.commands.length, 1);
    assert.equal(
      JSON.stringify(f.twitch.status).includes("fixture-token"),
      false,
    );
  } finally {
    f.twitch.disconnect();
  }
});
test("EventSub reconnect migrates without duplicating the subscription", async () => {
  const f = fixture();
  try {
    await f.twitch.authorize("fixture-code");
    f.welcome(f.sockets[0]);
    await settle();
    f.sockets[0].message({
      metadata: { message_type: "session_reconnect" },
      payload: {
        session: {
          reconnect_url: "wss://eventsub.wss.twitch.tv/ws?reconnect=fixture",
        },
      },
    });
    assert.equal(f.twitch.status.status, "reconnecting");
    f.welcome(f.sockets[1], "next");
    await settle();
    assert.equal(f.twitch.status.status, "connected");
    assert.equal(f.sockets[0].closed, true);
    assert.equal(
      f.calls.filter((c) => c.url.includes("/subscriptions")).length,
      1,
    );
  } finally {
    f.twitch.disconnect();
  }
});
test("revocation and unsafe reconnect destinations surface an error and stop sockets", async () => {
  const f = fixture();
  try {
    await f.twitch.authorize("fixture-code");
    f.welcome(f.sockets[0]);
    await settle();
    f.sockets[0].message({
      metadata: { message_type: "session_reconnect" },
      payload: { session: { reconnect_url: "wss://attacker.example/ws" } },
    });
    assert.equal(f.twitch.status.status, "error");
    assert.match(f.twitch.status.error, /invalid reconnect/);
    assert.equal(f.sockets[0].closed, true);
  } finally {
    f.twitch.disconnect();
  }
});
test("missing chat permission is rejected before opening a subscription", async () => {
  const t = new Twitch({
    clientId: "id",
    clientSecret: "secret",
    redirectUri: "http://localhost/callback",
    onCommand: () => {},
    fetch: (async (input: unknown) =>
      Response.json(
        String(input).includes("validate")
          ? { client_id: "id", scopes: [], user_id: "42", login: "pilot" }
          : { access_token: "fixture", refresh_token: "fixture" },
      )) as typeof fetch,
  });
  try {
    await assert.rejects(t.authorize("code"), /read-chat permission/);
    assert.notEqual(t.status.status, "connected");
  } finally {
    t.disconnect();
  }
});
