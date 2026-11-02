import "dotenv/config";
import express from "express";
import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { resolve, dirname } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { Game } from "./game.js";
import { Twitch } from "./twitch.js";
import {
  COMMANDS,
  WORLD,
  type ChatCommand,
  type ClientMessage,
  type Snapshot,
} from "../shared/types.js";

const { values: args } = parseArgs({
  options: { port: { type: "string" }, "app-url": { type: "string" } },
});
const port = Number(args.port || process.env.PORT || 3001);
const appUrl = new URL(
  args["app-url"] || process.env.APP_URL || `http://localhost:${port}`,
);
const dev = process.env.NODE_ENV !== "production";
const origins = new Set([
  appUrl.origin,
  ...(dev
    ? [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        `http://127.0.0.1:${port}`,
        `http://localhost:${port}`,
      ]
    : []),
]);
// Host allowlist: a DNS-rebinding page cannot reach this loopback server under its own name.
const hosts = new Set([
  appUrl.host,
  `localhost:${port}`,
  `127.0.0.1:${port}`,
  `[::1]:${port}`,
  ...(dev ? ["localhost:5173", "127.0.0.1:5173"] : []),
  ...(process.env.ALLOWED_HOSTS || "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean),
]);
const loopback = (address?: string) =>
  ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address || "");
const app = express();
const server = createServer(app);
const game = new Game();
const operatorKey = randomBytes(32).toString("hex");
const twitch = new Twitch({
  clientId: process.env.TWITCH_CLIENT_ID || "",
  clientSecret: process.env.TWITCH_CLIENT_SECRET || "",
  redirectUri: `${appUrl.origin}/auth/twitch/callback`,
  onCommand: (id, name, command) => {
    const result = game.chat(`twitch-${id}`, name, command, false);
    twitch.status.lastCommand = {
      name,
      command,
      at: Date.now(),
      accepted: result.accepted,
      reason: result.reason,
    };
  },
});
/** OAuth state -> expiry and the console origin to return to (dev :5173 or production). */
const pendingOAuth = new Map<string, { expires: number; returnTo: string }>();
const returnOrigin = (value: unknown) =>
  typeof value === "string" && origins.has(value) ? value : "";
const back = (returnTo: string, query: string) => `${returnTo}/?${query}`;
app.disable("x-powered-by");
app.use((req, res, next) => {
  if (!hosts.has(req.headers.host || "")) {
    res.status(421).type("text").send("Unknown host. Add it to ALLOWED_HOSTS.");
    return;
  }
  next();
});
app.use(express.json({ limit: "8kb" }));
app.use((req, res, next) => {
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.path.startsWith("/api") || req.path.startsWith("/auth"))
    res.setHeader("Cache-Control", "no-store");
  if (
    !["GET", "HEAD"].includes(req.method) &&
    (!origins.has(req.headers.origin || "") ||
      req.headers["x-operator-key"] !== operatorKey)
  ) {
    res
      .status(403)
      .json({ error: "Only the local pilot console can make this request." });
    return;
  }
  next();
});
// Only a console on this computer receives the control key. Other machines (if HOST is widened)
// get a spectator view and cannot fly, reset or change the mission.
app.get("/api/config", (req, res) =>
  res.json({
    configured: twitch.status.configured,
    operatorKey: loopback(req.socket.remoteAddress) ? operatorKey : "",
    redirectUri: `${appUrl.origin}/auth/twitch/callback`,
    appUrl: appUrl.origin,
  }),
);
app.get("/api/health", (_req, res) =>
  res.json({ ok: true, app: "last-signal" }),
);
app.get("/api/report", (_req, res) => {
  const s = game.state;
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="last-signal-mission.json"',
  );
  res.json({
    project: "LAST SIGNAL",
    missionId: s.id,
    mode: s.mode,
    simulated: s.mode === "demo",
    phase: s.phase,
    seed: s.seed,
    duration: Math.round(s.elapsed),
    rescuedPods: s.rescued,
    survivors: s.people,
    crewActions: s.actions,
    impactsBlocked: s.blocked,
    hullRepaired: Math.round(s.repaired),
    allHandsPulses: s.bursts,
    crew: [...s.crew].sort((a, b) => b.points - a.points),
    eventCount: game.history.length,
    events: game.history,
  });
});
app.get("/auth/twitch", (req, res) => {
  const returnTo = returnOrigin(req.query.return);
  if (!twitch.status.configured) {
    res.redirect(
      back(
        returnTo,
        "twitchError=Configure%20TWITCH_CLIENT_ID%20and%20TWITCH_CLIENT_SECRET%20in%20.env%20first.",
      ),
    );
    return;
  }
  for (const [key, entry] of pendingOAuth)
    if (Date.now() > entry.expires) pendingOAuth.delete(key);
  if (pendingOAuth.size >= 20) {
    res.status(429).send("Too many pending sign-ins. Try again later.");
    return;
  }
  const state = randomBytes(24).toString("hex");
  pendingOAuth.set(state, { expires: Date.now() + 10 * 60 * 1000, returnTo });
  res.cookie("twitch_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: appUrl.protocol === "https:",
    maxAge: 600000,
    path: "/auth/twitch/callback",
  });
  res.redirect(
    `https://id.twitch.tv/oauth2/authorize?${new URLSearchParams({ client_id: process.env.TWITCH_CLIENT_ID!, redirect_uri: `${appUrl.origin}/auth/twitch/callback`, response_type: "code", scope: "user:read:chat", state, force_verify: "true" })}`,
  );
});
app.get("/auth/twitch/callback", async (req, res) => {
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const cookie =
    req.headers.cookie
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("twitch_state="))
      ?.slice("twitch_state=".length) || "";
  res.clearCookie("twitch_state", { path: "/auth/twitch/callback" });
  const entry = pendingOAuth.get(state);
  const valid =
    state.length === cookie.length &&
    state.length > 0 &&
    timingSafeEqual(Buffer.from(state), Buffer.from(cookie)) &&
    (entry?.expires ?? 0) > Date.now();
  pendingOAuth.delete(state);
  // Only a validated state carries a return origin; it was checked against the allowlist.
  const returnTo = valid ? entry!.returnTo : "";
  if (!valid) {
    res.redirect(back("", "twitchError=Sign-in%20expired.%20Please%20try%20again."));
    return;
  }
  if (typeof req.query.code !== "string") {
    res.redirect(back(returnTo, "twitchError=Twitch%20sign-in%20was%20cancelled."));
    return;
  }
  try {
    await twitch.authorize(req.query.code);
    // Report success only after Twitch confirms the chat subscription.
    await twitch.waitUntilConnected(12000);
    if (game.state.phase !== "running" && game.state.phase !== "paused")
      game.reset("live");
    res.redirect(back(returnTo, "connected=1"));
  } catch (e) {
    res.redirect(
      back(
        returnTo,
        `twitchError=${encodeURIComponent(e instanceof Error ? e.message : "Twitch sign-in failed.")}`,
      ),
    );
  }
});
app.post("/api/twitch/channel", async (req, res) => {
  try {
    if (game.state.phase === "running" || game.state.phase === "paused")
      throw new Error("Finish or reset the mission before switching channels.");
    await twitch.connect(String(req.body.channel || ""));
    await twitch.waitUntilConnected(12000);
    game.reset("live");
    res.json({ ok: true });
  } catch (e) {
    res
      .status(400)
      .json({ error: e instanceof Error ? e.message : "Connection failed." });
  }
});
app.post("/api/twitch/anonymous", async (req, res) => {
  try {
    if (game.state.phase === "running" || game.state.phase === "paused")
      throw new Error("Reset the mission before connecting a channel.");
    await twitch.connectAnonymous(String(req.body.channel || "").trim());
    game.reset("live");
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({
      error: e instanceof Error ? e.message : "Twitch chat connection failed.",
    });
  }
});
app.post("/api/twitch/disconnect", (_req, res) => {
  twitch.disconnect();
  if (game.state.mode === "live" && game.state.phase === "running")
    game.pause();
  res.json({ ok: true });
});
app.post("/api/mode", (req, res) => {
  if (game.state.phase === "running" || game.state.phase === "paused") {
    res
      .status(409)
      .json({ error: "Reset the mission before switching modes." });
    return;
  }
  if (req.body.mode !== "demo" && req.body.mode !== "live") {
    res.status(400).json({ error: "Unknown mode." });
    return;
  }
  if (req.body.mode === "live" && twitch.status.status !== "connected") {
    res
      .status(400)
      .json({ error: "Connect Twitch before starting a live mission." });
    return;
  }
  game.reset(req.body.mode);
  res.json({ ok: true });
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
let pilot: WebSocket | undefined;
let inputAt = 0;
server.on("upgrade", (req, socket, head) => {
  if (
    !origins.has(req.headers.origin || "") ||
    !hosts.has(req.headers.host || "")
  ) {
    socket.destroy();
    return;
  }
  const url = new URL(req.url || "/", appUrl);
  if (url.pathname !== "/ws") {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    (ws as WebSocket & { operator: boolean }).operator =
      url.searchParams.get("key") === operatorKey;
    wss.emit("connection", ws);
  });
});
wss.on("connection", (raw) => {
  const ws = raw as WebSocket & { operator: boolean };
  let count = 0;
  let windowAt = Date.now();
  ws.on("message", (data) => {
    if (!ws.operator) return;
    if (Date.now() - windowAt > 1000) {
      count = 0;
      windowAt = Date.now();
    }
    if (++count > 90) return;
    try {
      const message = JSON.parse(data.toString()) as ClientMessage;
      if (message.type === "input") {
        if (
          pilot &&
          pilot !== ws &&
          pilot.readyState === WebSocket.OPEN &&
          Date.now() - inputAt < 700
        )
          return;
        pilot = ws;
        inputAt = Date.now();
        const i = message.input;
        if (
          !i ||
          ["up", "down", "left", "right"].some(
            (k) => typeof i[k as keyof typeof i] !== "boolean",
          )
        )
          return;
        if (i.fire === true && !game.input.fire) game.pressed.fire = true;
        if (i.dash === true && !game.input.dash) game.pressed.dash = true;
        if (i.use === true && !game.input.use) game.pressed.use = true;
        game.input = {
          up: i.up,
          down: i.down,
          left: i.left,
          right: i.right,
          fire: i.fire === true,
          dash: i.dash === true,
          use: i.use === true,
        };
      } else if (message.type === "action") {
        if (message.action === "start") {
          if (
            game.state.mode === "live" &&
            twitch.status.status !== "connected"
          )
            throw new Error(
              "Twitch is disconnected. Reconnect before launching.",
            );
          game.start();
        } else if (message.action === "pause") game.pause();
        else if (message.action === "reset") game.reset();
        else if (message.action === "simulation" && game.state.mode === "demo")
          game.state.simulation = Boolean(message.value);
        else if (message.action === "autopilot" && game.state.mode === "demo")
          game.state.autopilot = Boolean(message.value);
      } else if (
        message.type === "command" &&
        [...COMMANDS, "join", "drop", "meteor"].includes(message.command) &&
        typeof message.name === "string"
      ) {
        const name = message.name.trim().slice(0, 25) || "you";
        const result = game.chat(
          `manual-${name.toLowerCase()}`,
          name,
          message.command,
          true,
        );
        if (!result.accepted)
          ws.send(JSON.stringify({ type: "notice", text: result.reason }));
      }
    } catch (e) {
      ws.send(
        JSON.stringify({
          type: "notice",
          text: e instanceof Error ? e.message : "Invalid request.",
        }),
      );
    }
  });
  ws.on("close", () => {
    if (pilot === ws) {
      pilot = undefined;
      game.clearInput();
    }
  });
  ws.send(JSON.stringify(snapshot()));
});
function snapshot(): Snapshot {
  // Send only what the renderer can see: nearby asteroids and the recent events.
  const s = game.state;
  const view = {
    ...s,
    rocks: s.rocks.filter(
      (r) =>
        !r.hit &&
        r.x - s.distance > -200 &&
        r.x - s.distance < WORLD.width + 200,
    ),
    events: s.events.slice(-30),
  };
  return {
    type: "state",
    game: view,
    twitch: twitch.status,
    pilotConnected: Boolean(pilot && pilot.readyState === WebSocket.OPEN),
  };
}
let last = performance.now();
let frame = 0;
const interval = setInterval(() => {
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (Date.now() - inputAt > 700) game.clearInput();
  game.tick(dt);
  // 30 Hz snapshots: halves the wait between a key press and the ship visibly responding.
  frame++;
  {
    const payload = JSON.stringify(snapshot());
    for (const client of wss.clients)
      if (
        client.readyState === WebSocket.OPEN &&
        client.bufferedAmount < 500000
      )
        client.send(payload);
  }
}, 1000 / 30);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (existsSync(resolve(root, "dist/index.html"))) {
  app.use(express.static(resolve(root, "dist")));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(resolve(root, "dist/index.html")),
  );
} else
  app.get("/", (_req, res) =>
    res.send(
      "LAST SIGNAL API is running. Run npm run dev and open http://localhost:5173, or npm run build then npm start.",
    ),
  );
app.use(
  (
    error: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    res.status(400).json({
      error:
        error instanceof SyntaxError
          ? "Invalid JSON request."
          : "Request could not be processed.",
    });
  },
);
server.listen(port, process.env.HOST || "127.0.0.1", () =>
  console.log(
    `LAST SIGNAL ready: ${appUrl.origin} | Twitch ${twitch.status.configured ? "configured" : "not configured — rehearsal available"}`,
  ),
);
function shutdown() {
  clearInterval(interval);
  twitch.disconnect();
  for (const client of wss.clients) client.terminate();
  wss.close();
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
