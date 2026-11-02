import WebSocket from "ws";
import {
  parseCommand,
  type Command,
  type TwitchStatus,
} from "../shared/types.js";

export type IrcMessage = {
  tags: Record<string, string>;
  prefix: string;
  command: string;
  params: string[];
  text: string;
};
export function parseIrc(line: string): IrcMessage | null {
  const message: IrcMessage = {
    tags: {},
    prefix: "",
    command: "",
    params: [],
    text: "",
  };
  let rest = line;
  if (rest.startsWith("@")) {
    const end = rest.indexOf(" ");
    if (end < 0) return null;
    for (const pair of rest.slice(1, end).split(";")) {
      const at = pair.indexOf("=");
      const key = at < 0 ? pair : pair.slice(0, at);
      const value = at < 0 ? "" : pair.slice(at + 1);
      message.tags[key] = value.replace(
        /\\([snr:\\])/g,
        (_, c: string) =>
          ({ s: " ", n: "\n", r: "\r", ":": ";", "\\": "\\" })[c] ?? c,
      );
    }
    rest = rest.slice(end + 1);
  }
  if (rest.startsWith(":")) {
    const end = rest.indexOf(" ");
    if (end < 0) return null;
    message.prefix = rest.slice(1, end);
    rest = rest.slice(end + 1);
  }
  const trailing = rest.indexOf(" :");
  if (trailing >= 0) {
    message.text = rest.slice(trailing + 2);
    rest = rest.slice(0, trailing);
  }
  const parts = rest.trim().split(/\s+/);
  message.command = parts.shift() || "";
  message.params = parts;
  return message.command ? message : null;
}

// Twitch's anonymous IRC reader. No chat-writing command is implemented.
// It is a tested compatibility path; EventSub remains the recommended API path.
export class AnonymousChat {
  private ws?: WebSocket;
  private stopped = false;
  private generation = 0;
  private retries = 0;
  private retry?: ReturnType<typeof setTimeout>;
  private watchdog?: ReturnType<typeof setTimeout>;
  private buffer = "";
  private seen = new Set<string>();
  private pendingReject?: (error: Error) => void;
  constructor(
    private options: {
      channel: string;
      status: TwitchStatus;
      onCommand: (id: string, name: string, command: Command) => void;
      socket?: (url: string) => WebSocket;
    },
  ) {}
  connect(): Promise<void> {
    return this.open();
  }
  private open(): Promise<void> {
    const generation = ++this.generation;
    const status = this.options.status;
    this.buffer = "";
    const ws =
      this.options.socket?.("wss://irc-ws.chat.twitch.tv:443") ??
      new WebSocket("wss://irc-ws.chat.twitch.tv:443");
    this.ws = ws;
    const nick = `justinfan${Math.floor(100000 + Math.random() * 899999)}`;
    return new Promise((resolve, reject) => {
      this.pendingReject = reject;
      let joined = false;
      const watch = (timeout = 360000) => {
        clearTimeout(this.watchdog);
        this.watchdog = setTimeout(() => {
          if (!joined) {
            status.error =
              "Twitch did not confirm this channel. Check the channel name and retry.";
            reject(new Error(status.error));
          }
          ws.terminate();
        }, timeout);
      };
      ws.on("open", () => {
        watch(15000);
        ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands\r\n");
        ws.send("PASS SCHMOOPIIE\r\n");
        ws.send(`NICK ${nick}\r\n`);
        ws.send(`JOIN #${this.options.channel}\r\n`);
      });
      ws.on("message", (raw) => {
        if (this.stopped || generation !== this.generation) return;
        this.buffer += raw.toString();
        if (this.buffer.length > 128000) {
          this.buffer = "";
          ws.terminate();
          return;
        }
        const lines = this.buffer.split("\r\n");
        this.buffer = lines.pop() || "";
        for (const line of lines) {
          const m = parseIrc(line);
          if (!m) continue;
          if (m.command === "PING") {
            ws.send(`PONG :${m.text || m.params[0] || "tmi.twitch.tv"}\r\n`);
            watch();
            continue;
          }
          if (m.command === "RECONNECT") {
            ws.close();
            continue;
          }
          if (
            m.command === "ROOMSTATE" &&
            m.params[0] === `#${this.options.channel}` &&
            /^\d+$/.test(m.tags["room-id"] || "")
          ) {
            joined = true;
            this.retries = 0;
            status.status = "connected";
            status.error = "";
            watch();
            this.pendingReject = undefined;
            resolve();
          }
          if (
            m.command === "NOTICE" &&
            /failed|improperly|banned|suspended|no permission/i.test(m.text)
          ) {
            status.error =
              "Twitch refused anonymous chat access for this channel. Try OAuth or another channel.";
            status.status = "error";
            this.stopped = true;
            reject(new Error(status.error));
            ws.close();
            continue;
          }
          if (
            m.command !== "PRIVMSG" ||
            m.params[0] !== `#${this.options.channel}` ||
            !joined
          )
            continue;
          const id = m.tags.id;
          if (id && this.seen.has(id)) continue;
          if (id) {
            this.seen.add(id);
            if (this.seen.size > 2000)
              this.seen.delete(this.seen.values().next().value!);
          }
          status.received++;
          status.lastMessageAt = Date.now();
          const command = parseCommand(m.text);
          const login = m.prefix.split("!")[0];
          if (command && login && /^[a-zA-Z0-9_]+$/.test(login))
            this.options.onCommand(
              m.tags["user-id"] || login.toLowerCase(),
              m.tags["display-name"] || login,
              command,
            );
        }
      });
      ws.on("error", () => {
        if (!this.stopped && generation === this.generation)
          status.error = "Twitch chat connection interrupted. Retrying…";
      });
      ws.on("close", () => {
        if (this.stopped || generation !== this.generation) return;
        clearTimeout(this.watchdog);
        if (!joined) {
          reject(
            new Error(
              status.error ||
                "Twitch closed the chat connection. Check the channel and retry.",
            ),
          );
          this.pendingReject = undefined;
        }
        if (this.retries >= 6) {
          status.status = "error";
          status.error =
            "Twitch chat is unavailable. Join the channel again to retry.";
          return;
        }
        status.status = "reconnecting";
        this.retry = setTimeout(
          () => {
            void this.open().catch(() => {});
          },
          Math.min(30000, 1000 * 2 ** this.retries++),
        );
      });
    });
  }
  disconnect() {
    this.stopped = true;
    this.generation++;
    clearTimeout(this.retry);
    clearTimeout(this.watchdog);
    this.pendingReject?.(new Error("Connection cancelled."));
    this.pendingReject = undefined;
    this.ws?.close();
    this.seen.clear();
  }
}
