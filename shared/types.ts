export const WORLD = {
  width: 1200,
  height: 660,
  distance: 6900,
  duration: 120,
};
export const COMMANDS = ["shield", "boost", "repair"] as const;
export type Command = (typeof COMMANDS)[number];
/** Everything a viewer can type. `!join` boards the crew without spending a station charge. */
export type ChatCommand = Command | "join";
/** Tuning shared by the engine and the renderer. Cruise alone reaches the gate in 115 s. */
export const BALANCE = {
  cruise: 60,
  boosted: 110,
  /** Extra speed at full afterburner (pilot holding forward at the front of the zone). */
  afterburner: 16,
  /** The ship eases to a stop here instead of hitting the screen edge. */
  forwardLimit: 780,
  /** Debris damage scales with crew size, so a solo pilot or a small stream can still finish. */
  debrisFloor: 0.34,
  debrisPerCrew: 0.14,
};
export function debrisScale(crew: number) {
  return Math.min(1, BALANCE.debrisFloor + BALANCE.debrisPerCrew * crew);
}
export type Mode = "demo" | "live";
export type Phase = "ready" | "running" | "paused" | "won" | "lost";
export type Crew = {
  id: string;
  name: string;
  color: string;
  role: Command;
  actions: number;
  points: number;
  lastAction: number;
  simulated: boolean;
};
export type GameEvent = {
  id: number;
  t: number;
  type:
    | "command"
    | "rescue"
    | "hit"
    | "blocked"
    | "system"
    | "missed"
    | "sync"
    | "join"
    | "rejected";
  text: string;
  name?: string;
  command?: ChatCommand;
  color?: string;
  x?: number;
  y?: number;
  simulated?: boolean;
};
export type Rock = {
  id: number;
  x: number;
  y: number;
  r: number;
  rotation: number;
  hit: boolean;
  speed: number;
};
export type Pod = {
  id: number;
  x: number;
  y: number;
  name: string;
  status: "waiting" | "rescued" | "missed";
  people: number;
};
export type Ship = {
  speed: number;
  /** 0..1: the pilot holding forward at the front of the flight zone fires the afterburner. */
  afterburner: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hull: number;
  shield: number;
  boost: number;
  invincible: number;
};
export type GameState = {
  id: string;
  seed: number;
  phase: Phase;
  mode: Mode;
  elapsed: number;
  distance: number;
  ship: Ship;
  pods: Pod[];
  rocks: Rock[];
  crew: Crew[];
  events: GameEvent[];
  rescued: number;
  people: number;
  actions: number;
  blocked: number;
  repaired: number;
  simulation: boolean;
  autopilot: boolean;
  countdown: number;
  storm: boolean;
  reason: string;
  links: { role: Command; id: string; name: string; t: number }[];
  bursts: number;
  overdriveUntil: number;
  /** Current debris damage multiplier (0.34 to 1), derived from crew size. */
  debris: number;
};
export type TwitchStatus = {
  lastCommand?: {
    name: string;
    command: ChatCommand;
    at: number;
    accepted: boolean;
    reason?: string;
  };
  status: "offline" | "connecting" | "connected" | "reconnecting" | "error";
  channel: string;
  account: string;
  error: string;
  received: number;
  lastMessageAt: number | null;
  configured: boolean;
  transport: "eventsub" | "irc" | null;
};
export type Snapshot = {
  type: "state";
  game: GameState;
  twitch: TwitchStatus;
  pilotConnected: boolean;
};
export type Input = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
};
export type ClientMessage =
  | { type: "input"; input: Input }
  | {
      type: "action";
      action: "start" | "pause" | "reset" | "simulation" | "autopilot";
      value?: boolean;
    }
  | { type: "command"; command: ChatCommand; name: string };
/** Exact command, optionally followed by any words: `!boost go` works, `!boosted` does not.
 * Trailing words let a viewer repeat a command when Twitch blocks an identical message. */
export function parseCommand(text: string): ChatCommand | null {
  const match = /^!(shield|boost|repair|join)(?:\s|$)/i.exec(text.trim());
  return match ? (match[1].toLowerCase() as ChatCommand) : null;
}
export const COLORS: Record<Command, string> = {
  shield: "#70ead8",
  boost: "#f5b65d",
  repair: "#c2a2ff",
};
