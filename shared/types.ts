export const WORLD = {
  width: 1200,
  height: 660,
  distance: 6900,
  duration: 120,
};
export const COMMANDS = ["shield", "boost", "repair"] as const;
export type Command = (typeof COMMANDS)[number];
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
  type: "command" | "rescue" | "hit" | "blocked" | "system" | "missed" | "sync";
  text: string;
  name?: string;
  command?: Command;
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
};
export type TwitchStatus = {
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
  | { type: "command"; command: Command; name: string };
export function parseCommand(text: string): Command | null {
  const match = /^!(shield|boost|repair)(?:\s|$)/i.exec(text.trim());
  return match ? (match[1].toLowerCase() as Command) : null;
}
export const COLORS: Record<Command, string> = {
  shield: "#70ead8",
  boost: "#f5b65d",
  repair: "#c2a2ff",
};
