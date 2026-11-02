import WebSocket from "ws";
import {
  parseCommand,
  type ChatCommand,
  type TwitchStatus,
} from "../shared/types.js";
import { AnonymousChat } from "./irc.js";

type Tokens = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};
type Identity = {
  client_id: string;
  login: string;
  user_id: string;
  scopes: string[];
};
type Options = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  onCommand: (id: string, name: string, command: ChatCommand) => void;
  fetch?: typeof fetch;
  socket?: (url: string) => WebSocket;
};

// Twitch tokens only live in this server instance; never included in snapshots or logs.
export class Twitch {
  status: TwitchStatus;
  private tokens?: Tokens;
  private user?: Identity;
  private broadcaster = "";
  private socket?: WebSocket;
  private sockets = new Set<WebSocket>();
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private watchdog?: ReturnType<typeof setTimeout>;
  private validationTimer?: ReturnType<typeof setInterval>;
  private stopped = true;
  private retries = 0;
  private generation = 0;
  private seen = new Map<string, number>();
  private irc?: AnonymousChat;
  private http: typeof fetch;
  constructor(private options: Options) {
    this.http = options.fetch ?? fetch;
    this.status = {
      status: "offline",
      channel: "",
      account: "",
      error: "",
      received: 0,
      lastMessageAt: null,
      configured: Boolean(options.clientId && options.clientSecret),
      transport: null,
    };
  }
  private async request(url: string, init: RequestInit = {}) {
    const response = await this.http(url, {
      ...init,
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      // Avoid forwarding responses containing sensitive values from auth endpoints.
      if (url.includes("id.twitch.tv"))
        throw new Error(
          `Twitch authorization failed (${response.status}). Reconnect your account.`,
        );
      const body = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      throw new Error(
        body.message?.slice(0, 200) ||
          `Twitch request failed (${response.status}).`,
      );
    }
    return response.json();
  }
  private headers() {
    return {
      Authorization: `Bearer ${this.tokens!.access_token}`,
      "Client-Id": this.options.clientId,
      "Content-Type": "application/json",
    };
  }
  async authorize(code: string) {
    this.disconnect();
    const generation = this.generation;
    const params = new URLSearchParams({
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: this.options.redirectUri,
    });
    const tokens = (await this.request("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      body: params,
    })) as Tokens;
    const user = (await this.request("https://id.twitch.tv/oauth2/validate", {
      headers: { Authorization: `OAuth ${tokens.access_token}` },
    })) as Identity;
    if (generation !== this.generation) return;
    if (
      user.client_id !== this.options.clientId ||
      !user.scopes.includes("user:read:chat")
    )
      throw new Error(
        "Twitch did not grant read-chat permission. Reconnect and approve access.",
      );
    this.tokens = tokens;
    this.user = user;
    this.status.account = user.login;
    this.status.transport = "eventsub";
    this.validationTimer = setInterval(
      () => void this.validate(),
      55 * 60 * 1000,
    );
    await this.connect(user.login);
  }
  /** Resolves once the transport is subscribed and receiving; rejects on error or timeout. */
  async waitUntilConnected(timeoutMs: number) {
    const started = Date.now();
    while (this.status.status !== "connected") {
      if (this.status.status === "error" || this.status.status === "offline")
        throw new Error(this.status.error || "Twitch connection failed.");
      if (Date.now() - started > timeoutMs) {
        this.fail(
          "Twitch did not confirm the chat subscription in time. Check the channel and try again.",
        );
        throw new Error(this.status.error);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  async connectAnonymous(channel: string) {
    if (!/^[a-zA-Z0-9_]{1,25}$/.test(channel))
      throw new Error("Use a Twitch channel name, without a URL or #.");
    this.disconnect();
    Object.assign(this.status, {
      status: "connecting",
      channel: channel.toLowerCase(),
      account: "Anonymous read-only",
      transport: "irc",
      error: "",
    });
    const irc = new AnonymousChat({
      channel: channel.toLowerCase(),
      status: this.status,
      onCommand: this.options.onCommand,
    });
    this.irc = irc;
    await irc.connect();
  }
  private async validate() {
    if (!this.tokens) return;
    try {
      const response = await this.http("https://id.twitch.tv/oauth2/validate", {
        headers: { Authorization: `OAuth ${this.tokens.access_token}` },
        signal: AbortSignal.timeout(10000),
      });
      if (response.status === 401) await this.refresh();
      else if (!response.ok)
        throw new Error("Could not validate Twitch session.");
    } catch {
      this.fail("Your Twitch session needs attention. Reconnect your account.");
    }
  }
  private async refresh() {
    if (!this.tokens) throw new Error("Connect Twitch first.");
    const params = new URLSearchParams({
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret,
      refresh_token: this.tokens.refresh_token,
      grant_type: "refresh_token",
    });
    this.tokens = (await this.request("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      body: params,
    })) as Tokens;
  }
  async connect(channel: string) {
    if (!this.user || !this.tokens)
      throw new Error("Connect your Twitch account first.");
    if (!/^[a-zA-Z0-9_]{1,25}$/.test(channel))
      throw new Error("Use a Twitch channel name, without a URL or #.");
    this.closeTransport();
    this.stopped = false;
    this.retries = 0;
    const generation = this.generation;
    this.status.status = "connecting";
    this.status.error = "";
    try {
      const result = (await this.request(
        `https://api.twitch.tv/helix/users?login=${encodeURIComponent(channel.toLowerCase())}`,
        { headers: this.headers() },
      )) as { data: { id: string; login: string }[] };
      if (generation !== this.generation) return;
      if (!result.data[0])
        throw new Error("That Twitch channel does not exist.");
      this.broadcaster = result.data[0].id;
      this.status.channel = result.data[0].login;
      this.open("wss://eventsub.wss.twitch.tv/ws", false);
    } catch (e) {
      if (generation === this.generation)
        this.fail(
          e instanceof Error ? e.message : "Could not connect to Twitch.",
        );
      throw e;
    }
  }
  private open(url: string, migration: boolean) {
    if (this.stopped) return;
    const generation = this.generation;
    const previous = this.socket;
    const ws = this.options.socket?.(url) ?? new WebSocket(url);
    this.sockets.add(ws);
    if (!migration) this.socket = ws;
    let keepalive = 20;
    const watch = () => {
      if (ws !== this.socket) return;
      clearTimeout(this.watchdog);
      this.watchdog = setTimeout(() => ws.terminate(), (keepalive + 5) * 1000);
    };
    ws.on("open", watch);
    ws.on("message", async (raw) => {
      if (generation !== this.generation || this.stopped) return;
      watch();
      try {
        const msg = JSON.parse(raw.toString());
        const type = msg.metadata?.message_type;
        if (type === "session_welcome") {
          keepalive = msg.payload.session.keepalive_timeout_seconds ?? 20;
          if (migration) {
            this.socket = ws;
            previous?.close();
          } else await this.subscribe(msg.payload.session.id);
          if (generation !== this.generation || this.stopped) return;
          this.status.status = "connected";
          this.status.error = "";
          this.retries = 0;
          watch();
        } else if (type === "notification") {
          const id = msg.metadata.message_id;
          if (typeof id !== "string" || this.seen.has(id)) return;
          this.seen.set(id, Date.now());
          if (this.seen.size > 2000)
            this.seen.delete(this.seen.keys().next().value!);
          if (msg.payload.subscription?.type !== "channel.chat.message") return;
          const event = msg.payload.event;
          if (event.broadcaster_user_id !== this.broadcaster) return;
          this.status.received++;
          this.status.lastMessageAt = Date.now();
          const command = parseCommand(event.message?.text ?? "");
          if (
            command &&
            typeof event.chatter_user_id === "string" &&
            typeof event.chatter_user_name === "string"
          )
            this.options.onCommand(
              event.chatter_user_id,
              event.chatter_user_name,
              command,
            );
        } else if (type === "session_reconnect") {
          const next = new URL(msg.payload.session.reconnect_url);
          if (
            next.protocol !== "wss:" ||
            next.hostname !== "eventsub.wss.twitch.tv"
          )
            throw new Error("Twitch sent an invalid reconnect URL.");
          this.status.status = "reconnecting";
          this.open(next.href, true);
        } else if (type === "revocation")
          this.fail("Twitch revoked chat access. Reconnect your account.");
      } catch (e) {
        this.fail(
          e instanceof Error ? e.message : "Twitch event processing failed.",
        );
      }
    });
    ws.on("error", () => {
      if (!this.stopped && generation === this.generation)
        this.status.error = "Twitch connection interrupted. Retrying…";
    });
    ws.on("close", () => {
      this.sockets.delete(ws);
      if (this.stopped || generation !== this.generation || this.socket !== ws)
        return;
      clearTimeout(this.watchdog);
      if (this.retries >= 6) {
        this.fail("Twitch is unavailable. Reconnect to try again.");
        return;
      }
      this.status.status = "reconnecting";
      this.reconnectTimer = setTimeout(
        () => this.open("wss://eventsub.wss.twitch.tv/ws", false),
        Math.min(30000, 1000 * 2 ** this.retries++),
      );
    });
  }
  private async subscribe(sessionId: string) {
    await this.request("https://api.twitch.tv/helix/eventsub/subscriptions", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        type: "channel.chat.message",
        version: "1",
        condition: {
          broadcaster_user_id: this.broadcaster,
          user_id: this.user!.user_id,
        },
        transport: { method: "websocket", session_id: sessionId },
      }),
    });
  }
  private fail(error: string) {
    this.closeTransport();
    this.status.status = "error";
    this.status.error = error;
  }
  private closeTransport() {
    this.generation++;
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.watchdog);
    for (const ws of this.sockets) ws.close();
    this.sockets.clear();
    this.socket = undefined;
  }
  disconnect() {
    delete this.status.lastCommand;
    this.irc?.disconnect();
    this.irc = undefined;
    this.closeTransport();
    clearInterval(this.validationTimer);
    this.tokens = undefined;
    this.user = undefined;
    this.seen.clear();
    Object.assign(this.status, {
      status: "offline",
      account: "",
      channel: "",
      error: "",
      received: 0,
      lastMessageAt: null,
      transport: null,
    });
  }
}
