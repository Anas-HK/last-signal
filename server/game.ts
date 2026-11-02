import { randomUUID } from "node:crypto";
import {
  COLORS,
  type Command,
  type GameState,
  type Input,
  type Mode,
  WORLD,
} from "../shared/types.js";

export function random(seed: number) {
  let a = seed | 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
export class Game {
  state: GameState;
  input: Input = { up: false, down: false, left: false, right: false };
  private rng = random(42);
  private clock = 0;
  private nextId = 0;
  private nextBot = 0;
  private rateWindow = 0;
  private rateCount = 0;
  constructor() {
    this.state = this.create("demo", 42);
  }
  private create(mode: Mode, seed: number): GameState {
    this.rng = random(seed);
    this.clock = 0;
    this.nextBot = 0;
    this.nextId = 0;
    this.rateWindow = 0;
    this.rateCount = 0;
    const rocks = Array.from({ length: 100 }, (_, i) => ({
      id: i,
      x: 850 + this.rng() * 6800,
      y: 65 + this.rng() * 530,
      r: 12 + this.rng() * 29,
      rotation: this.rng() * Math.PI * 2,
      hit: false,
      speed: 3 + this.rng() * 10,
    }));
    return {
      id: randomUUID(),
      seed,
      phase: "ready",
      mode,
      elapsed: 0,
      distance: 0,
      ship: {
        x: 245,
        y: 330,
        vx: 0,
        vy: 0,
        hull: 100,
        shield: 20,
        boost: 0,
        invincible: 0,
      },
      pods: [
        {
          id: 1,
          x: 1700,
          y: 190,
          name: "KEPLER",
          people: 4,
          status: "waiting",
        },
        {
          id: 2,
          x: 3500,
          y: 470,
          name: "VOYAGER",
          people: 6,
          status: "waiting",
        },
        { id: 3, x: 5400, y: 250, name: "ECHO", people: 3, status: "waiting" },
      ],
      rocks,
      crew: [],
      events: [],
      rescued: 0,
      people: 0,
      actions: 0,
      blocked: 0,
      repaired: 0,
      simulation: mode === "demo",
      autopilot: false,
      countdown: 3,
      storm: false,
      reason: "",
      links: [],
      bursts: 0,
      overdriveUntil: 0,
    };
  }
  reset(mode = this.state.mode, seed = 42) {
    this.state = this.create(mode, seed);
    this.clearInput();
  }
  start() {
    if (this.state.phase === "ready") {
      this.state.phase = "running";
      this.event("system", "Distress signal acquired. Bring them home.");
    }
  }
  pause() {
    if (this.state.phase === "running" || this.state.phase === "paused") {
      this.state.phase = this.state.phase === "paused" ? "running" : "paused";
      this.clearInput();
    }
  }
  clearInput() {
    this.input = { up: false, down: false, left: false, right: false };
  }
  event(
    type: GameState["events"][number]["type"],
    text: string,
    extra: Partial<GameState["events"][number]> = {},
  ) {
    this.state.events.push({
      id: ++this.nextId,
      t: this.state.elapsed,
      type,
      text,
      ...extra,
    });
    if (this.state.events.length > 70) this.state.events.shift();
  }
  command(
    id: string,
    name: string,
    role: Command,
    simulated: boolean,
  ): { accepted: boolean; reason?: string } {
    const s = this.state;
    if (s.phase !== "running" || s.countdown > 0)
      return { accepted: false, reason: "Launch the mission first." };
    if ((s.mode === "live" && simulated) || (s.mode === "demo" && !simulated))
      return {
        accepted: false,
        reason: "Command source does not match this mission.",
      };
    const member = s.crew.find((c) => c.id === id);
    if (member && this.clock - member.lastAction < 1.8)
      return {
        accepted: false,
        reason: "Your crew member is recharging (2s).",
      };
    if (this.clock - this.rateWindow >= 1) {
      this.rateWindow = this.clock;
      this.rateCount = 0;
    }
    if (this.rateCount >= 15)
      return { accepted: false, reason: "Crew uplink is busy. Try again." };
    const before =
      role === "shield"
        ? s.ship.shield
        : role === "boost"
          ? s.ship.boost
          : s.ship.hull;
    if (before >= 99.5)
      return {
        accepted: false,
        reason: `${role === "repair" ? "Hull" : role === "shield" ? "Shields" : "Boost"} already at capacity.`,
      };
    if (!member && s.crew.length >= 500)
      return { accepted: false, reason: "Crew is full for this mission." };
    this.rateCount++;
    const amount = Math.min(
      100 - before,
      role === "shield" ? 18 : role === "boost" ? 22 : 8,
    );
    if (role === "shield") s.ship.shield += amount;
    if (role === "boost") s.ship.boost += amount;
    if (role === "repair") {
      s.ship.hull += amount;
      s.repaired += amount;
    }
    const crew = member ?? {
      id,
      name: name.replace(/[\x00-\x1f]/g, "").slice(0, 25) || "crew",
      role,
      color: COLORS[role],
      actions: 0,
      points: 0,
      lastAction: -10,
      simulated,
    };
    if (!member) s.crew.push(crew);
    crew.role = role;
    crew.color = COLORS[role];
    crew.lastAction = this.clock;
    crew.actions++;
    crew.points += Math.round(amount);
    s.actions++;
    this.event(
      "command",
      role === "shield"
        ? "reinforced the shields"
        : role === "boost"
          ? "fired the engines"
          : "patched the hull",
      {
        name: crew.name,
        command: role,
        color: crew.color,
        simulated,
        x: s.ship.x,
        y: s.ship.y,
      },
    );
    s.links = s.links.filter(
      (l) => s.elapsed - l.t < 6 && l.role !== role && l.id !== id,
    );
    s.links.push({ role, id, name: crew.name, t: s.elapsed });
    if (s.links.length === 3) {
      s.bursts++;
      s.overdriveUntil = s.elapsed + 6;
      for (const link of s.links) {
        const c = s.crew.find((c) => c.id === link.id);
        if (c) c.points += 40;
      }
      this.event(
        "sync",
        `ALL HANDS! ${s.links.map((l) => l.name).join(" + ")} linked a rescue pulse.`,
        { color: "#70ead8", x: s.ship.x, y: s.ship.y, simulated },
      );
      s.links = [];
    }
    return { accepted: true };
  }
  tick(dt: number) {
    dt = clamp(dt, 0, 0.1);
    const s = this.state;
    if (s.phase !== "running") return;
    if (s.countdown > 0) {
      s.countdown = Math.max(0, s.countdown - dt);
      return;
    }
    this.clock += dt;
    s.elapsed += dt;
    s.links = s.links.filter((l) => s.elapsed - l.t < 6);
    const ship = s.ship;
    s.storm = s.distance > 2400 && s.distance < 4500;
    const speed = 53 + (ship.boost > 1 ? 26 : 0);
    s.distance += speed * dt;
    ship.boost = Math.max(0, ship.boost - dt * 9);
    ship.shield = Math.max(0, ship.shield - dt * 1.9);
    ship.hull = Math.max(0, ship.hull - dt * (s.storm ? 0.3 : 0.1));
    ship.invincible = Math.max(0, ship.invincible - dt);
    let dy = Number(this.input.down) - Number(this.input.up),
      dx = Number(this.input.right) - Number(this.input.left);
    if (s.mode === "demo" && s.autopilot && !dy && !dx) {
      const pod = s.pods.find(
        (p) => p.status === "waiting" && p.x - s.distance > ship.x - 100,
      );
      const target =
        pod && pod.x - s.distance < 1100
          ? pod.y
          : 330 + Math.sin(s.elapsed * 0.35) * 105;
      dy = clamp((target - ship.y) / 80, -1, 1);
      dx = (245 - ship.x) / 100;
    }
    ship.vx += (dx * 235 - ship.vx) * Math.min(1, dt * 9);
    ship.vy += (dy * 260 - ship.vy) * Math.min(1, dt * 9);
    ship.x = clamp(ship.x + ship.vx * dt, 85, 960);
    ship.y = clamp(ship.y + ship.vy * dt, 85, WORLD.height - 80);
    for (const rock of s.rocks) {
      if (rock.hit) continue;
      const x = rock.x - s.distance;
      if (x < -100 || x > 1300) continue;
      rock.y += Math.sin(s.elapsed * 0.7 + rock.id) * dt * rock.speed;
      if (
        Math.hypot(x - ship.x, rock.y - ship.y) < rock.r + 22 &&
        ship.invincible <= 0
      ) {
        rock.hit = true;
        ship.invincible = 0.7;
        const damage = s.storm ? 23 : 17;
        if (ship.shield >= damage) {
          ship.shield -= damage;
          s.blocked++;
          this.event("blocked", "Crew shields absorbed an impact", {
            x,
            y: rock.y,
          });
        } else {
          const hit = damage - ship.shield;
          ship.shield = 0;
          ship.hull = Math.max(0, ship.hull - hit);
          this.event(
            "hit",
            `Hull hit. ${Math.ceil(hit)} damage. Crew, send !repair!`,
            { x, y: rock.y },
          );
        }
      }
    }
    for (const pod of s.pods) {
      if (pod.status !== "waiting") continue;
      const x = pod.x - s.distance;
      if (
        Math.hypot(x - ship.x, pod.y - ship.y) <
        (s.overdriveUntil > s.elapsed ? 195 : 100)
      ) {
        pod.status = "rescued";
        s.rescued++;
        s.people += pod.people;
        this.event(
          "rescue",
          `${pod.name} secured. ${pod.people} survivors aboard.`,
          { x, y: pod.y },
        );
      } else if (x < -80) {
        pod.status = "missed";
        this.event("missed", `${pod.name} signal lost. Keep moving.`);
      }
    }
    if (s.mode === "demo" && s.simulation && this.clock > this.nextBot) {
      this.nextBot = this.clock + 0.65 + this.rng() * 0.6;
      const names = [
        "orbit_olive",
        "neonfox",
        "cosmic_kai",
        "lunar_lou",
        "pixelpilot",
        "stardust_sam",
        "echo_echo",
        "nova_rae",
        "moss.exe",
        "tinycomet",
        "astrobee",
        "moonwitch",
      ];
      const n = Math.floor(this.rng() * names.length);
      const role: Command =
        ship.hull < 99 && this.rng() > 0.55
          ? "repair"
          : ship.shield < 70 && this.rng() > 0.35
            ? "shield"
            : "boost";
      this.command(`sim-${n}`, names[n], role, true);
    }
    if (ship.hull <= 0)
      this.finish(
        false,
        "The ship was lost in the storm. Your crew can try again.",
      );
    else if (s.distance >= WORLD.distance)
      this.finish(
        s.rescued > 0,
        s.rescued === 3
          ? "Every signal answered. Everyone home."
          : s.rescued > 0
            ? "Jump complete. Your crew brought them home."
            : "You reached the gate, but no pods were recovered.",
      );
    else if (s.elapsed >= WORLD.duration)
      this.finish(false, "The jump window closed. A new crew can try again.");
  }
  private finish(won: boolean, reason: string) {
    this.state.phase = won ? "won" : "lost";
    this.state.reason = reason;
    this.clearInput();
    this.event("system", reason);
  }
}
