import { randomUUID } from "node:crypto";
import {
  BALANCE,
  COLORS,
  COMMANDS,
  debrisScale,
  POWERUPS,
  type ChatCommand,
  type Command,
  type Crew,
  type GameEvent,
  type PowerUp,
  type GameState,
  type Input,
  type Mode,
  WORLD,
} from "../shared/types.js";

type Result = { accepted: boolean; reason?: string; short?: string };
const STATION = { shield: "SHIELDS", boost: "ENGINES", repair: "REPAIRS" };
const BOT_NAMES = [
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
/** Pilot laser and the chat-driven extras. */
const LASER = { speed: 1000, cooldown: 0.2, rapidCooldown: 0.09, heatPerShot: 17, coolPerSecond: 34, overheat: 1.7 };
/** Debris walls with a single gap, placed away from the pods; and comets in the storm. */
const WAVES = [1250, 2650, 4250, 4900, 6200];
const COMET_EVERY = 6;
const DROP = { perViewer: 10, onScreen: 2, speed: 150, reach: 55, points: 25 };
const METEOR = { perViewer: 15, onScreen: 2, spacing: 2.5, warn: 1.3, damage: 14, radius: 20 };

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
  private cooldowns = new Map<string, number>();
  private nextId = 0;
  private nextBot = 0;
  private rateWindow = 0;
  private rateCount = 0;
  /** Complete mission history for the exported log. `state.events` keeps only the recent 70. */
  history: GameEvent[] = [];
  private rejectedAt = new Map<string, number>();
  private rejectWindow = 0;
  private rejectCount = 0;
  private dropAt = new Map<string, number>();
  private meteorAt = new Map<string, number>();
  private lastMeteor = -10;
  private fireAt = -10;
  private dashAt = -10;
  private held = { dash: false, use: false };
  /** Key presses latched between ticks, so a quick tap is never lost. */
  pressed = { fire: false, dash: false, use: false };
  private nextObject = 0;
  private nextChaos = 6;
  private nextWave = 0;
  private nextComet = 0;
  constructor() {
    this.state = this.create("demo", 42);
  }
  private create(mode: Mode, seed: number): GameState {
    this.rng = random(seed);
    this.clock = 0;
    this.cooldowns.clear();
    this.nextBot = 0;
    this.nextId = 0;
    this.rateWindow = 0;
    this.rateCount = 0;
    this.history = [];
    this.rejectedAt.clear();
    this.rejectWindow = 0;
    this.rejectCount = 0;
    this.dropAt.clear();
    this.meteorAt.clear();
    this.lastMeteor = -10;
    this.fireAt = -10;
    this.dashAt = -10;
    this.held = { dash: false, use: false };
    this.pressed = { fire: false, dash: false, use: false };
    this.nextObject = 0;
    this.nextChaos = 6;
    this.nextWave = 0;
    this.nextComet = 0;
    const rocks = Array.from({ length: 100 }, (_, i) => ({
      id: i,
      x: 850 + this.rng() * 6800,
      y: 65 + this.rng() * 530,
      r: 12 + this.rng() * 29,
      rotation: this.rng() * Math.PI * 2,
      hit: false,
      speed: 3 + this.rng() * 10,
      hp: 1,
    }));
    // Big rocks take two laser hits (computed from size, so the seeded layout is unchanged).
    for (const rock of rocks) rock.hp = rock.r > 28 ? 2 : 1;
    return {
      id: randomUUID(),
      seed,
      phase: "ready",
      mode,
      elapsed: 0,
      distance: 0,
      ship: {
        speed: BALANCE.cruise,
        afterburner: 0,
        x: 245,
        y: 330,
        vx: 0,
        vy: 0,
        hull: 100,
        shield: 20,
        boost: 0,
        invincible: 0,
        dash: 0,
        heat: 0,
        overheated: 0,
        powerup: null,
        bubble: 0,
        rapid: 0,
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
      debris: debrisScale(0),
      shots: [],
      meteors: [],
      drops: [],
      blasts: [],
      destroyed: 0,
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
    const event = { id: ++this.nextId, t: this.state.elapsed, type, text, ...extra };
    this.state.events.push(event);
    if (this.state.events.length > 70) this.state.events.shift();
    this.history.push(event);
    if (this.history.length > 5000) this.history.shift();
  }
  /** Entry point for every viewer command (Twitch chat or the rehearsal console). Rejections
   * are announced in the feed so viewers know their message arrived, throttled per viewer. */
  chat(id: string, name: string, command: ChatCommand, simulated: boolean): Result {
    const result =
      command === "join"
        ? this.join(id, name, simulated)
        : command === "drop"
          ? this.drop(id, name, simulated)
          : command === "meteor"
            ? this.meteor(id, name, simulated)
            : this.command(id, name, command, simulated);
    if (result.accepted || !result.short) return result;
    const now = this.clock;
    if (now - (this.rejectedAt.get(id) ?? -10) < 4) return result;
    if (now - this.rejectWindow >= 1) {
      this.rejectWindow = now;
      this.rejectCount = 0;
    }
    if (this.rejectCount >= 3) return result;
    this.rejectCount++;
    this.rejectedAt.set(id, now);
    if (this.rejectedAt.size > 2000)
      this.rejectedAt.delete(this.rejectedAt.keys().next().value!);
    this.event("rejected", `!${command} · ${result.short}`, {
      name: this.clean(name),
      command,
      color: "#8b9aa4",
      simulated,
    });
    return result;
  }
  private clean(name: string) {
    return name.replace(/[\x00-\x1f]/g, "").slice(0, 25) || "crew";
  }
  private gate(simulated: boolean, member: boolean): Result | null {
    const s = this.state;
    if (s.phase === "won" || s.phase === "lost")
      return {
        accepted: false,
        reason: "Start a new rescue to activate your crew.",
        short: "mission over",
      };
    if (s.phase === "paused")
      return {
        accepted: false,
        reason: "Resume the mission to activate crew commands.",
        short: "mission paused",
      };
    if ((s.mode === "live" && simulated) || (s.mode === "demo" && !simulated))
      return {
        accepted: false,
        reason: "Command source does not match this mission.",
      };
    if (!member && s.crew.length >= 500)
      return { accepted: false, reason: "Crew is full for this mission.", short: "crew full" };
    return null;
  }
  /** Board the ship. The viewer is assigned the least-staffed station; no charge is spent. */
  join(id: string, name: string, simulated: boolean): Result {
    const s = this.state;
    const member = s.crew.find((c) => c.id === id);
    const blocked = this.gate(simulated, Boolean(member));
    if (blocked) return blocked;
    if (member) return { accepted: false, reason: "Already aboard.", short: "already aboard" };
    if (this.clock - this.rateWindow >= 1) {
      this.rateWindow = this.clock;
      this.rateCount = 0;
    }
    if (this.rateCount >= 15)
      return { accepted: false, reason: "Crew uplink is busy. Try again.", short: "uplink busy" };
    this.rateCount++;
    const count = (r: Command) => s.crew.filter((c) => c.role === r).length;
    const role = [...COMMANDS].sort((a, b) => count(a) - count(b))[0];
    s.crew.push({
      id,
      name: this.clean(name),
      role,
      color: COLORS[role],
      actions: 0,
      points: 0,
      lastAction: -10,
      simulated,
    });
    this.event("join", `boarded the ship · ${STATION[role]} station`, {
      name: this.clean(name),
      command: "join",
      color: COLORS[role],
      simulated,
      x: s.ship.x,
      y: s.ship.y,
    });
    return { accepted: true };
  }
  private uplink(): Result | null {
    if (this.clock - this.rateWindow >= 1) {
      this.rateWindow = this.clock;
      this.rateCount = 0;
    }
    if (this.rateCount >= 15)
      return { accepted: false, reason: "Crew uplink is busy. Try again.", short: "uplink busy" };
    this.rateCount++;
    return null;
  }
  private flying(what: string): Result | null {
    const s = this.state;
    if (s.phase === "running" && s.countdown <= 0) return null;
    return { accepted: false, reason: `${what} open after launch.`, short: `${what.toLowerCase()} open after launch` };
  }
  /** Find or board a viewer (least-staffed station), without an event. */
  private member(id: string, name: string, simulated: boolean): Crew {
    const s = this.state;
    const existing = s.crew.find((c) => c.id === id);
    if (existing) return existing;
    const count = (r: Command) => s.crew.filter((c) => c.role === r).length;
    const role = [...COMMANDS].sort((a, b) => count(a) - count(b))[0];
    const crew: Crew = {
      id,
      name: this.clean(name),
      role,
      color: COLORS[role],
      actions: 0,
      points: 0,
      lastAction: -10,
      simulated,
    };
    s.crew.push(crew);
    return crew;
  }
  /** `!drop`: a viewer launches a power-up crate the pilot has to catch. */
  drop(id: string, name: string, simulated: boolean): Result {
    const s = this.state;
    const blocked =
      this.gate(simulated, s.crew.some((c) => c.id === id)) ?? this.flying("Drops");
    if (blocked) return blocked;
    const wait = DROP.perViewer - (this.clock - (this.dropAt.get(id) ?? -99));
    if (wait > 0)
      return {
        accepted: false,
        reason: `Your next drop is ready in ${Math.ceil(wait)}s.`,
        short: `next drop in ${Math.ceil(wait)}s`,
      };
    if (s.drops.length >= DROP.onScreen)
      return { accepted: false, reason: "Two crates are already in flight.", short: "drop bay busy" };
    const busy = this.uplink();
    if (busy) return busy;
    this.dropAt.set(id, this.clock);
    const roll = this.rng();
    const kind: PowerUp = roll < 0.3 ? "nova" : roll < 0.65 ? "bubble" : "overdrive";
    const crew = this.member(id, name, simulated);
    crew.actions++;
    crew.lastAction = s.elapsed;
    s.actions++;
    s.drops.push({
      id: ++this.nextObject,
      x: WORLD.width + 40,
      y: 110 + this.rng() * 440,
      kind,
      owner: crew.name,
      color: POWERUPS[kind].color,
    });
    this.event("drop", `sent a ${POWERUPS[kind].name}`, {
      name: crew.name,
      command: "drop",
      color: crew.color,
      simulated,
    });
    return { accepted: true };
  }
  /** `!meteor`: a viewer throws a named meteor at the pilot, telegraphed by a warning line. */
  meteor(id: string, name: string, simulated: boolean): Result {
    const s = this.state;
    const blocked =
      this.gate(simulated, s.crew.some((c) => c.id === id)) ?? this.flying("Meteors");
    if (blocked) return blocked;
    const wait = METEOR.perViewer - (this.clock - (this.meteorAt.get(id) ?? -99));
    if (wait > 0)
      return {
        accepted: false,
        reason: `Your next meteor is ready in ${Math.ceil(wait)}s.`,
        short: `next meteor in ${Math.ceil(wait)}s`,
      };
    if (s.meteors.length >= METEOR.onScreen || this.clock - this.lastMeteor < METEOR.spacing)
      return { accepted: false, reason: "The sky is full. Try again.", short: "sky is full, try again" };
    const busy = this.uplink();
    if (busy) return busy;
    this.meteorAt.set(id, this.clock);
    this.lastMeteor = this.clock;
    const owner = this.clean(name);
    this.spawnMeteor(owner);
    this.event("meteor", "threw a meteor at the pilot", {
      name: owner,
      command: "meteor",
      color: "#fb7c70",
      simulated,
    });
    return { accepted: true };
  }
  private spawnMeteor(owner: string) {
    const s = this.state;
    const x = WORLD.width + 60;
    const y = 100 + this.rng() * 460;
    const vx = -(330 + this.rng() * 90);
    // Aimed where the pilot is now; the warning line shows the exact path, so it can be dodged.
    const vy = (s.ship.y - y) / ((x - s.ship.x) / -vx);
    s.meteors.push({ id: ++this.nextObject, x, y, vx, vy, r: METEOR.radius, warn: METEOR.warn, owner, color: owner ? "#ff7a59" : "#d9a066" });
  }
  /** A wall of rocks across the lane with one gap. Big rocks in it take two hits. */
  private spawnWave(at: number) {
    const s = this.state;
    const gap = 140 + this.rng() * 380;
    for (let y = 92; y < WORLD.height - 70; y += 60) {
      if (Math.abs(y - gap) < 88) continue;
      const r = 19 + this.rng() * 13;
      s.rocks.push({
        id: 1000 + this.nextObject++,
        x: at + this.rng() * 24,
        y,
        r,
        rotation: this.rng() * Math.PI * 2,
        hit: false,
        speed: 1.5,
        hp: r > 28 ? 2 : 1,
      });
    }
  }
  private blast(x: number, y: number, r: number, color: string) {
    const s = this.state;
    s.blasts.push({ id: ++this.nextObject, x, y, r, color, t: s.elapsed });
    if (s.blasts.length > 40) s.blasts.shift();
  }
  private credit(name: string, points: number) {
    const crew = this.state.crew.find((c) => c.name === name);
    if (crew) {
      crew.points += points;
      crew.lastAction = this.state.elapsed;
    }
  }
  private usePowerup() {
    const s = this.state;
    const ship = s.ship;
    const held = ship.powerup;
    if (!held) return;
    ship.powerup = null;
    if (held.kind === "nova") {
      // Clears every asteroid and meteor on screen.
      for (const rock of s.rocks) {
        const x = rock.x - s.distance;
        if (rock.hit || x < -60 || x > WORLD.width + 60) continue;
        rock.hit = true;
        s.destroyed++;
        this.blast(x, rock.y, rock.r, "#e9f6ff");
      }
      for (const m of s.meteors) {
        if (m.warn <= 0) {
          s.destroyed++;
          this.blast(m.x, m.y, m.r, "#ff9a5c");
        }
      }
      s.meteors = [];
    } else if (held.kind === "bubble") ship.bubble = 5;
    else ship.rapid = 6;
    this.credit(held.owner, 15);
    this.event("powerup", `${POWERUPS[held.kind].name} fired`, {
      name: held.owner,
      color: held.color,
      x: ship.x,
      y: ship.y,
    });
  }
  /** Something the training pilot should shoot: a rock or meteor in its lane ahead. */
  private threatAhead() {
    const s = this.state;
    const ship = s.ship;
    for (const rock of s.rocks) {
      if (rock.hit) continue;
      const x = rock.x - s.distance;
      // A human-like reaction window: only rocks close ahead and squarely in the lane.
      if (x > ship.x + 40 && x < ship.x + 300 && Math.abs(rock.y - ship.y) < rock.r + 6) return true;
    }
    return s.meteors.some(
      (m) => m.warn <= 0 && m.x > ship.x && m.x < ship.x + 600 && Math.abs(m.y - ship.y) < m.r + 30,
    );
  }
  command(
    id: string,
    name: string,
    role: Command,
    simulated: boolean,
  ): Result {
    const s = this.state;
    // Commands work in the lobby and during the launch countdown: viewers precharge the ship.
    const member = s.crew.find((c) => c.id === id);
    const blocked = this.gate(simulated, Boolean(member));
    if (blocked) return blocked;
    if (this.clock - (this.cooldowns.get(id) ?? -10) < 1.8)
      return {
        accepted: false,
        reason: "Your crew member is recharging (2s).",
        short: "recharging, try again in 2s",
      };
    if (this.clock - this.rateWindow >= 1) {
      this.rateWindow = this.clock;
      this.rateCount = 0;
    }
    if (this.rateCount >= 15)
      return {
        accepted: false,
        reason: "Crew uplink is busy. Try again.",
        short: "uplink busy, try again",
      };
    const before =
      role === "shield"
        ? s.ship.shield
        : role === "boost"
          ? s.ship.boost
          : s.ship.hull;
    if (before >= 99.5) {
      const system = role === "repair" ? "Hull" : role === "shield" ? "Shields" : "Boost";
      return {
        accepted: false,
        reason: `${system} already at capacity.`,
        short: `${system.toLowerCase()} already full`,
      };
    }
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
      name: this.clean(name),
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
    crew.lastAction = s.elapsed;
    this.cooldowns.set(id, this.clock);
    crew.actions++;
    crew.points += Math.round(amount);
    s.actions++;
    this.event(
      "command",
      role === "shield"
        ? "reinforced the shields"
        : role === "boost"
          ? "fueled the boost tank"
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
      (l) => this.clock - l.t < 6 && l.role !== role && l.id !== id,
    );
    s.links.push({ role, id, name: crew.name, t: this.clock });
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
    this.clock += dt;
    const s = this.state;
    s.links = s.links.filter((l) => this.clock - l.t < 6);
    s.debris = debrisScale(s.crew.length);
    if (s.phase !== "running") return;
    if (s.countdown > 0) {
      s.countdown = Math.max(0, s.countdown - dt);
      return;
    }
    s.elapsed += dt;
    const ship = s.ship;
    s.storm = s.distance > 2400 && s.distance < 4500;
    ship.dash = Math.max(0, ship.dash - dt);
    ship.bubble = Math.max(0, ship.bubble - dt);
    ship.rapid = Math.max(0, ship.rapid - dt);
    ship.overheated = Math.max(0, ship.overheated - dt);
    ship.heat = Math.max(0, ship.heat - dt * LASER.coolPerSecond);
    s.blasts = s.blasts.filter((b) => s.elapsed - b.t < 1);
    if (this.nextWave < WAVES.length && s.distance > WAVES[this.nextWave] - 1400)
      this.spawnWave(WAVES[this.nextWave++]);
    if (s.storm && s.elapsed > this.nextComet && s.meteors.length < METEOR.onScreen) {
      this.nextComet = s.elapsed + COMET_EVERY;
      this.spawnMeteor("");
    }
    // Chat fuels the boost tank; the pilot decides when to burn it (Shift = dash).
    const targetSpeed =
      (ship.dash > 0 ? BALANCE.dash : BALANCE.cruise) +
      ship.afterburner * BALANCE.afterburner;
    ship.speed += (targetSpeed - ship.speed) * Math.min(1, dt * (ship.dash > 0 ? 8 : 4));
    s.distance += ship.speed * dt;
    ship.shield = Math.max(0, ship.shield - dt * 1.9);
    ship.hull = Math.max(0, ship.hull - dt * (s.storm ? 0.3 : 0.1));
    ship.invincible = Math.max(0, ship.invincible - dt);
    let dy = Number(this.input.down) - Number(this.input.up),
      dx = Number(this.input.right) - Number(this.input.left);
    let fire = Boolean(this.input.fire),
      dashKey = Boolean(this.input.dash),
      useKey = Boolean(this.input.use);
    const auto = s.mode === "demo" && s.autopilot;
    const pod = s.pods.find(
      (p) => p.status === "waiting" && p.x - s.distance > ship.x - 100,
    );
    const podNear = Boolean(pod && pod.x - s.distance < 1100);
    if (auto && !dy && !dx) {
      const crate = s.drops.find((d) => d.x > ship.x - 20 && d.x < ship.x + 520);
      const target = podNear
        ? pod!.y
        : crate
          ? crate.y
          : 330 + Math.sin(s.elapsed * 0.35) * 105;
      dy = clamp((target - ship.y) / 80, -1, 1);
      dx = (245 - ship.x) / 100;
    }
    if (auto) {
      fire ||= this.threatAhead();
      dashKey ||= ship.boost >= 60 && ship.dash <= 0 && !podNear;
      useKey ||= Boolean(ship.powerup);
    }
    const dashEdge = (dashKey && !this.held.dash) || this.pressed.dash,
      useEdge = (useKey && !this.held.use) || this.pressed.use;
    fire ||= this.pressed.fire;
    this.pressed = { fire: false, dash: false, use: false };
    this.held = { dash: dashKey, use: useKey };
    if (
      dashEdge &&
      ship.boost >= BALANCE.dashCost &&
      ship.dash <= 0 &&
      this.clock - this.dashAt >= BALANCE.dashCooldown
    ) {
      this.dashAt = this.clock;
      ship.boost -= BALANCE.dashCost;
      ship.dash = BALANCE.dashTime;
    }
    if (useEdge) this.usePowerup();
    if (
      fire &&
      ship.overheated <= 0 &&
      this.clock - this.fireAt >= (ship.rapid > 0 ? LASER.rapidCooldown : LASER.cooldown)
    ) {
      this.fireAt = this.clock;
      for (const offset of ship.rapid > 0 ? [-14, 0, 14] : [0])
        s.shots.push({ id: ++this.nextObject, x: ship.x + 50, y: ship.y + offset });
      if (ship.rapid <= 0) {
        ship.heat += LASER.heatPerShot;
        if (ship.heat >= 100) {
          ship.heat = 100;
          ship.overheated = LASER.overheat;
        }
      }
    }
    // Soft forward zone: thrust fades out over the last 140 units, so the ship eases to a
    // stop instead of slamming into the edge. Pushing on at the front fires the afterburner.
    const room = clamp((BALANCE.forwardLimit - ship.x) / 140, 0, 1);
    const pushing = dx > 0 && ship.x > BALANCE.forwardLimit - 90;
    ship.afterburner +=
      ((pushing ? 1 : 0) - ship.afterburner) * Math.min(1, dt * (pushing ? 2.5 : 4));
    if (dx > 0) dx *= room;
    ship.vx += (dx * 235 - ship.vx) * Math.min(1, dt * 9);
    ship.vy += (dy * 260 - ship.vy) * Math.min(1, dt * 9);
    ship.x = clamp(ship.x + ship.vx * dt, 85, BALANCE.forwardLimit);
    ship.y = clamp(ship.y + ship.vy * dt, 85, WORLD.height - 80);
    for (const shot of s.shots) {
      const from = shot.x;
      shot.x += LASER.speed * dt;
      let spent = false;
      for (const rock of s.rocks) {
        if (rock.hit) continue;
        const rx = rock.x - s.distance;
        if (rx + rock.r < from || rx - rock.r > shot.x || Math.abs(rock.y - shot.y) > rock.r + 4)
          continue;
        spent = true;
        rock.hp--;
        if (rock.hp <= 0) {
          rock.hit = true;
          s.destroyed++;
          this.blast(rx, rock.y, rock.r, "#f5b65d");
        } else this.blast(rx - rock.r * 0.6, shot.y, 8, "#e3e8df");
        break;
      }
      if (!spent)
        for (const m of s.meteors) {
          if (m.warn > 0 || m.x + m.r < from || m.x - m.r > shot.x || Math.abs(m.y - shot.y) > m.r + 6)
            continue;
          spent = true;
          const at = { x: m.x, y: m.y };
          m.x = -9999;
          s.destroyed++;
          this.blast(at.x, at.y, m.r * 1.4, "#ff9a5c");
          if (m.owner) this.event("destroyed", `${m.owner}'s meteor destroyed`, { name: m.owner, color: "#fb7c70", ...at });
          break;
        }
      if (spent) shot.x = 99999;
    }
    s.shots = s.shots.filter((shot) => shot.x < WORLD.width + 40);
    const ramming = ship.dash > 0 || ship.bubble > 0;
    for (const rock of s.rocks) {
      if (rock.hit) continue;
      const x = rock.x - s.distance;
      if (x < -100 || x > 1300) continue;
      rock.y += Math.sin(s.elapsed * 0.7 + rock.id) * dt * rock.speed;
      if (
        (ship.bubble > 0 || (ship.dash > 0 && rock.r <= 28)) &&
        Math.hypot(x - ship.x, rock.y - ship.y) < rock.r + 26
      ) {
        rock.hit = true;
        s.destroyed++;
        this.blast(x, rock.y, rock.r, ship.bubble > 0 ? "#f5d36b" : "#bfe9ff");
        continue;
      }
      if (
        Math.hypot(x - ship.x, rock.y - ship.y) < rock.r + 22 &&
        ship.invincible <= 0
      ) {
        rock.hit = true;
        ship.invincible = 0.7;
        const damage = (s.storm ? 23 : 17) * s.debris;
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
    for (const m of s.meteors) {
      if (m.warn > 0) {
        m.warn -= dt;
        continue;
      }
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (Math.hypot(m.x - ship.x, m.y - ship.y) >= m.r + 22) continue;
      const at = { x: m.x, y: m.y };
      m.x = -9999;
      if (ramming) {
        s.destroyed++;
        this.blast(at.x, at.y, m.r * 1.4, "#ff9a5c");
        if (m.owner) this.event("destroyed", `${m.owner}'s meteor smashed`, { name: m.owner, color: "#fb7c70", ...at });
        continue;
      }
      const absorbed = Math.min(ship.shield, METEOR.damage);
      ship.shield -= absorbed;
      ship.hull = Math.max(0, ship.hull - (METEOR.damage - absorbed));
      ship.invincible = Math.max(ship.invincible, 0.4);
      this.blast(at.x, at.y, m.r * 1.4, "#fb7c70");
      this.event(
        absorbed >= METEOR.damage ? "blocked" : "hit",
        `${m.owner ? `${m.owner}'s meteor` : "Comet"} hit. ${Math.ceil(METEOR.damage - absorbed)} damage.`,
        m.owner ? { name: m.owner, color: "#fb7c70", ...at } : at,
      );
    }
    s.meteors = s.meteors.filter((m) => m.x > -120);
    for (const d of s.drops) {
      d.x -= DROP.speed * dt;
      d.y = clamp(d.y + Math.sin(s.elapsed * 2 + d.id) * dt * 18, 90, WORLD.height - 90);
      if (Math.hypot(d.x - ship.x, d.y - ship.y) >= DROP.reach) continue;
      ship.powerup = { kind: d.kind, owner: d.owner, color: d.color };
      this.credit(d.owner, DROP.points);
      this.event("pickup", `${POWERUPS[d.kind].name} caught`, { name: d.owner, color: d.color, x: d.x, y: d.y });
      d.x = -9999;
    }
    s.drops = s.drops.filter((d) => d.x > -60);
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
      const names = BOT_NAMES;
      const n = Math.floor(this.rng() * names.length);
      const role: Command =
        ship.hull < 99 && this.rng() > 0.55
          ? "repair"
          : ship.shield < 70 && this.rng() > 0.35
            ? "shield"
            : "boost";
      this.command(`sim-${n}`, names[n], role, true);
    }
    if (s.mode === "demo" && s.simulation && this.clock > this.nextChaos) {
      this.nextChaos = this.clock + 5 + this.rng() * 4;
      const n = Math.floor(this.rng() * BOT_NAMES.length);
      if (this.rng() < 0.55) this.drop(`sim-${n}`, BOT_NAMES[n], true);
      else this.meteor(`sim-${n}`, BOT_NAMES[n], true);
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
