export const WORLD = {
  width: 1200,
  height: 660,
  distance: 6900,
  duration: 120,
};
export const COMMANDS = ["shield", "boost", "repair"] as const;
export type Command = (typeof COMMANDS)[number];
/** Everything a viewer can type. `!join` boards the crew without spending a station charge,
 * `!drop` sends the pilot a power-up crate, `!meteor` throws a named meteor at the pilot. */
export type ChatCommand = Command | "join" | "drop" | "meteor";
export type PowerUp = "nova" | "bubble" | "overdrive";
export const POWERUPS: Record<PowerUp, { name: string; color: string }> = {
  nova: { name: "NOVA BOMB", color: "#e9f6ff" },
  bubble: { name: "BUBBLE SHIELD", color: "#f5d36b" },
  overdrive: { name: "OVERDRIVE GUNS", color: "#ff9a5c" },
};
/** Tuning shared by the engine and the renderer. Cruise alone reaches the gate in 115 s. */
export const BALANCE = {
  cruise: 60,
  boosted: 110,
  /** Speed while the pilot burns a dash (Shift). A dash costs this much boost fuel. */
  dash: 175,
  dashCost: 20,
  dashTime: 1.1,
  /** Seconds between dashes, so a full tank cannot chain them into permanent ramming. */
  dashCooldown: 3.5,
  /** Extra speed at full afterburner (pilot holding forward at the front of the zone). */
  afterburner: 16,
  /** The ship eases to a stop here instead of hitting the screen edge. */
  forwardLimit: 780,
  /** Debris damage scales with crew size, so a solo pilot or a small stream can still finish. */
  debrisFloor: 0.5,
  debrisPerCrew: 0.1,
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
    | "rejected"
    | "drop"
    | "pickup"
    | "powerup"
    | "meteor"
    | "destroyed";
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
  /** Laser hits left. Big rocks take two and crack after the first. */
  hp: number;
};
/** Laser bolt, in screen coordinates. */
export type Shot = { id: number; x: number; y: number };
/** A viewer's `!meteor`, in screen coordinates. While `warn` > 0 only its warning line shows. */
export type Meteor = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  warn: number;
  owner: string;
  color: string;
};
/** A viewer's `!drop` crate, in screen coordinates. The pilot flies through it to collect. */
export type Drop = {
  id: number;
  x: number;
  y: number;
  kind: PowerUp;
  owner: string;
  color: string;
};
/** Recent explosions so the renderer can burst them (kept for about a second). */
export type Blast = { id: number; x: number; y: number; r: number; color: string; t: number };
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
  /** Seconds left in the current dash; the ship rams through rocks while dashing. */
  dash: number;
  /** Laser heat 0..100; at 100 the laser overheats for a moment. */
  heat: number;
  overheated: number;
  /** The crate the pilot is holding, ready to fire with E. */
  powerup: { kind: PowerUp; owner: string; color: string } | null;
  bubble: number;
  rapid: number;
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
  /** Current debris damage multiplier (0.5 to 1), derived from crew size. */
  debris: number;
  shots: Shot[];
  meteors: Meteor[];
  drops: Drop[];
  blasts: Blast[];
  /** Asteroids and meteors destroyed by the pilot this mission. */
  destroyed: number;
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
  /** Space: laser (held). Shift: dash. E: fire the held power-up. */
  fire?: boolean;
  dash?: boolean;
  use?: boolean;
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
  const match = /^!(shield|boost|repair|join|drop|meteor)(?:\s|$)/i.exec(text.trim());
  return match ? (match[1].toLowerCase() as ChatCommand) : null;
}
export const COLORS: Record<Command, string> = {
  shield: "#70ead8",
  boost: "#f5b65d",
  repair: "#c2a2ff",
};
