import { useEffect, useRef } from "react";
import type { GameState, Input } from "../shared/types";
import { BALANCE, COLORS, WORLD } from "../shared/types";
import { playSound } from "./audio";

type Props = {
  game: GameState;
  onInput?: (input: Input) => void;
  onPause?: () => void;
  spectator?: boolean;
};
const W = WORLD.width,
  H = WORLD.height;
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  r: number;
};
/** Short-lived callouts and shockwaves spawned from authoritative game events. */
type Float = { text: string; sub?: string; color: string; born: number; x: number; y: number; big?: boolean; attached?: boolean };
type Ring = { x: number; y: number; color: string; born: number; life: number; from: number; to: number; width: number; hex?: boolean; attached?: boolean };
type Ticker = { name: string; text: string; color: string; born: number; dim?: boolean };
const reduceMotion =
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const stars = Array.from({ length: 210 }, (_, i) => ({
  x: ((i * 7919 + 41) % 12000) / 10,
  y: ((i * 3319 + 127) % 6600) / 10,
  r: i % 11 === 0 ? 1.8 : i % 3 === 0 ? 1 : 0.55,
  alpha: 0.2 + (i % 7) / 11,
}));
function polygon(
  ctx: CanvasRenderingContext2D,
  points: number[][],
  fill: string,
  stroke?: string,
) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}
function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color = "#8e9da5",
  size = 10,
  align: CanvasTextAlign = "left",
) {
  // Scaled up for stream legibility: the canvas is shown at roughly 0.8x in the console.
  ctx.font = `${Math.max(11, Math.round(size * 1.25))}px "JetBrains Mono", monospace`;
  ctx.textAlign = align;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}
function circle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  fill?: string,
  stroke?: string,
) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}
function card(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill = "#070d15c4",
  border = "#ffffff16",
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(10, h / 2));
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = border;
  ctx.stroke();
}
function mono(ctx: CanvasRenderingContext2D, size: number, weight = 400) {
  ctx.font = `${weight} ${size}px "JetBrains Mono", monospace`;
}
function glow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, "transparent");
  ctx.fillStyle = gradient;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

export function Space({ game, onInput, onPause, spectator }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef(game);
  // Arrival time of the newest snapshot: the renderer extrapolates from it (dead reckoning)
  // so the ship tracks the server position instead of trailing behind it.
  const receivedAt = useRef(performance.now());
  if (latest.current !== game) receivedAt.current = performance.now();
  latest.current = game;
  const localInput = useRef<Input | null>(null);
  const inputCallback = useRef(onInput);
  inputCallback.current = onInput;
  const pauseCallback = useRef(onPause);
  pauseCallback.current = onPause;
  useEffect(() => {
    const el = canvas.current!;
    let animation = 0;
    let last = performance.now();
    let elapsed = 0;
    let id = "";
    let eventId = 0;
    let shipX = 245,
      shipY = 330,
      distance = 0;
    let particles: Particle[] = [];
    let impactAt = -10,
      impactBlocked = false;
    let floats: Float[] = [];
    let rings: Ring[] = [];
    let ticker: Ticker[] = [];
    let shakeAt = -10,
      shakePower = 0;
    let flashAt = -10,
      flashColor = "#fb7c70",
      flashPower = 0;
    let boostAt = -10,
      shieldAt = -10;
    let lastCount = 0;
    // One callout per message: a repeat refreshes the existing one instead of stacking.
    const shout = (f: Float) => {
      const twin = floats.find((o) => o.text === f.text && elapsed - o.born < 1.2);
      if (twin) {
        twin.born = elapsed;
        twin.sub = f.sub;
      } else floats.push(f);
    };
    // Ship-centred rings follow the ship and never double up within half a second.
    const pulse = (r: Ring) => {
      if (r.attached && rings.some((o) => o.attached && o.color === r.color && elapsed - o.born < 0.5)) return;
      rings.push(r);
    };
    const resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      el.width = W * dpr;
      el.height = H * dpr;
    };
    resize();
    const ctx = el.getContext("2d")!;
    const render = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      elapsed += dt;
      const s = latest.current;
      const active = s.phase === "running" && s.countdown <= 0;
      const velocity = s.ship.speed ?? (s.ship.boost > 1 ? 79 : 53);
      const burn = s.ship.afterburner ?? 0;
      const boostRatio = clampN(
        (velocity - BALANCE.cruise - burn * BALANCE.afterburner) /
          (BALANCE.boosted - BALANCE.cruise),
        0,
        1,
      );
      const streak = Math.max(boostRatio, burn * 0.75);
      if (id !== s.id) {
        const firstLoad = id === "";
        id = s.id;
        particles = [];
        floats = [];
        rings = [];
        ticker = [];
        shipX = s.ship.x;
        shipY = s.ship.y;
        distance = s.distance;
        // Opening the page mid-mission must not replay old effects or sounds.
        eventId = firstLoad ? (s.events.at(-1)?.id ?? 0) : 0;
        if (firstLoad)
          for (const e of s.events.slice(-4))
            if (e.name && (e.type === "command" || e.type === "join"))
              ticker.push({ name: e.name, text: e.type === "join" ? "JOINED" : e.command === "boost" ? "BOOST" : e.command === "shield" ? "SHIELD +18" : "REPAIR +8", color: e.color || "#8b9aa4", born: elapsed });
      }
      // Dead reckoning: extrapolate the last snapshot by its age, and for the pilot apply the
      // keys being held right now. The server stays authoritative; this only hides latency.
      const running = s.phase === "running" && s.countdown <= 0;
      const age = running ? Math.min(0.1, (now - receivedAt.current) / 1000) : 0;
      let vx = s.ship.vx,
        vy = s.ship.vy;
      const keys = localInput.current;
      if (keys && running) {
        const k = Math.min(1, age * 9);
        vx += ((Number(keys.right) - Number(keys.left)) * 235 - vx) * k;
        vy += ((Number(keys.down) - Number(keys.up)) * 260 - vy) * k;
      }
      const predX = clampN(s.ship.x + ((s.ship.vx + vx) / 2) * age, 85, BALANCE.forwardLimit);
      const predY = clampN(s.ship.y + ((s.ship.vy + vy) / 2) * age, 85, H - 80);
      const predD = s.distance + (s.ship.speed ?? 60) * age;
      const lerp = Math.min(1, dt * 24);
      shipX += ((s.phase === "ready" ? 720 : predX) - shipX) * lerp;
      shipY += ((s.phase === "ready" ? 380 : predY) - shipY) * lerp;
      distance += (predD - distance) * Math.min(1, dt * 30);
      const dpr = el.width / W;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#070d15";
      ctx.fillRect(0, 0, W, H);
      // Screen shake for impacts (skipped for reduced-motion users).
      const shakeAge = elapsed - shakeAt;
      const shake =
        !reduceMotion && shakeAge < 0.45 ? shakePower * (1 - shakeAge / 0.45) : 0;
      ctx.save();
      if (shake) ctx.translate((Math.random() * 2 - 1) * shake, (Math.random() * 2 - 1) * shake);
      const zoom = 1 + (active ? burn * 0.035 + boostRatio * 0.015 : 0);
      if (zoom > 1.001) {
        ctx.translate(shipX, shipY);
        ctx.scale(zoom, zoom);
        ctx.translate(-shipX, -shipY);
      }
      glow(ctx, 870, 180, 550, "#12333b45");
      glow(ctx, 70, 620, 380, "#29314435");
      // A distant ringed world: entirely procedural, no asset or network dependency.
      ctx.save();
      ctx.translate(930 - distance * 0.008, 170);
      ctx.rotate(-0.34);
      ctx.strokeStyle = "#527c7c17";
      ctx.lineWidth = 28;
      ctx.beginPath();
      ctx.ellipse(0, 0, 290, 63, 0, 0, Math.PI * 2);
      ctx.stroke();
      const planet = ctx.createRadialGradient(-75, -80, 2, 0, 0, 154);
      planet.addColorStop(0, "#517c7f");
      planet.addColorStop(0.28, "#30494f");
      planet.addColorStop(0.67, "#152630");
      planet.addColorStop(1, "#0a111b");
      circle(ctx, 0, 0, 151, planet as unknown as string, "#46666e40");
      ctx.strokeStyle = "#8aa99b30";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, 0, 290, 63, 0, 0, Math.PI);
      ctx.stroke();
      ctx.restore();
      for (const star of stars) {
        const offset =
          distance * (star.r > 1 ? 0.3 : 0.1) +
          elapsed * (s.phase === "ready" ? 3 : 0);
        const x = (((star.x - offset) % W) + W) % W;
        ctx.globalAlpha =
          star.alpha * (0.85 + Math.sin(elapsed + star.x) * 0.15);
        if (active && streak > 0.05) {
          ctx.strokeStyle = "#bcd9d8";
          ctx.lineWidth = star.r;
          ctx.beginPath();
          ctx.moveTo(x, star.y);
          ctx.lineTo(x + streak * (20 + star.r * 20), star.y);
          ctx.stroke();
        } else circle(ctx, x, star.y, star.r, "#bcd9d8");
      }
      ctx.globalAlpha = 1;
      // Quiet map grid and sector reference marks.
      ctx.strokeStyle = "#35515d14";
      ctx.lineWidth = 1;
      for (let x = -((distance * 0.25) % 100); x < W; x += 100) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = 60; y < H; y += 100) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      if (s.storm) {
        glow(ctx, W * 0.6, H, 650, "#a95b2d12");
      }
      for (const rock of s.rocks) {
        const x = rock.x - distance;
        if (rock.hit || x < -80 || x > W + 80) continue;
        ctx.save();
        ctx.translate(x, rock.y);
        ctx.rotate(rock.rotation + elapsed * (rock.id % 2 ? 0.06 : -0.08));
        const points = Array.from({ length: 9 }, (_, i) => {
          const a = (i / 9) * Math.PI * 2;
          const r = rock.r * (0.78 + ((rock.id * 7 + i * 13) % 9) / 35);
          return [Math.cos(a) * r, Math.sin(a) * r];
        });
        ctx.lineWidth = 1.3;
        polygon(ctx, points, "#1b2932", "#53626a");
        polygon(
          ctx,
          [
            [-rock.r * 0.4, -rock.r * 0.55],
            [rock.r * 0.5, -rock.r * 0.2],
            [rock.r * 0.15, rock.r * 0.45],
            [-rock.r * 0.5, rock.r * 0.1],
          ],
          "#23343c",
        );
        ctx.strokeStyle = "#63737b50";
        ctx.beginPath();
        ctx.moveTo(-rock.r * 0.4, -rock.r * 0.55);
        ctx.lineTo(rock.r * 0.2, -rock.r * 0.25);
        ctx.lineTo(rock.r * 0.15, rock.r * 0.45);
        ctx.stroke();
        ctx.restore();
      }
      const nextPod = s.pods.find((p) => p.status === "waiting");
      for (const pod of s.pods) {
        const x = pod.x - distance;
        if (pod.status !== "waiting" || x < -100 || x > W + 100) continue;
        const pulse = 0.5 + Math.sin(elapsed * 3) * 0.5;
        glow(ctx, x, pod.y, 100 + pulse * 20, "#f5b65d12");
        ctx.setLineDash([4, 7]);
        ctx.lineWidth = 1;
        circle(ctx, x, pod.y, 79 + pulse * 6, undefined, "#f5b65d35");
        ctx.setLineDash([]);
        ctx.save();
        ctx.translate(x, pod.y);
        ctx.rotate(Math.sin(elapsed) * 0.08);
        polygon(
          ctx,
          [
            [-21, -12],
            [14, -12],
            [23, -4],
            [23, 7],
            [14, 14],
            [-21, 14],
            [-28, 4],
            [-28, -4],
          ],
          "#3e3428",
          "#e9b566",
        );
        ctx.fillStyle = "#f5b65d";
        ctx.fillRect(-10, -6, 16, 11);
        ctx.fillStyle = "#f5b65d70";
        ctx.fillRect(-20, -22, 5, 8);
        ctx.fillRect(-20, 16, 5, 8);
        ctx.restore();
        label(ctx, `${pod.name} · ${pod.people}`, x, pod.y - 100, "#f5c27a", 11, "center");
        // The how-to hint only appears until the first rescue.
        if (s.rescued === 0 && pod === nextPod)
          label(ctx, "FLY INTO THE RING", x, pod.y + 104, "#8e9da5", 9, "center");
        if (Math.hypot(x - shipX, pod.y - shipY) < 200) {
          ctx.strokeStyle = "#f5b65d60";
          ctx.setLineDash([5, 4]);
          ctx.beginPath();
          ctx.moveTo(shipX + 42, shipY);
          ctx.lineTo(x, pod.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      if (nextPod && nextPod.x - distance > W - 80) {
        const y = nextPod.y;
        ctx.strokeStyle = "#f5b65d55";
        ctx.beginPath();
        ctx.moveTo(W - 34, y - 8);
        ctx.lineTo(W - 26, y);
        ctx.lineTo(W - 34, y + 8);
        ctx.stroke();
        label(
          ctx,
          `${nextPod.name}  ${Math.max(0, Math.round((nextPod.x - distance - shipX) / 10))} km`,
          W - 44,
          y + 4,
          "#f5b65d",
          10,
          "right",
        );
      }
      if (distance > WORLD.distance - 1300) {
        const x = WORLD.distance - distance + 240;
        glow(ctx, x, H / 2, 200, "#70ead81d");
        ctx.save();
        ctx.translate(x, H / 2);
        ctx.scale(0.45, 1);
        ctx.lineWidth = 5;
        circle(ctx, 0, 0, 190, undefined, "#70ead8");
        ctx.lineWidth = 1;
        circle(ctx, 0, 0, 203, undefined, "#70ead840");
        ctx.restore();
        label(ctx, "JUMP GATE // HOME", x, 95, "#70ead8", 13, "center");
      }
      // Engine trails.
      const thrust = active ? 1 + boostRatio * 2.3 + burn * 1.2 : 0.45;
      if (active && burn > 0.05) {
        glow(ctx, shipX - 70, shipY, 120 + burn * 60, `rgba(150,225,255,${0.16 * burn})`);
        for (let n = 0; n < 2; n++) {
          const y = shipY + (n ? 17 : -17);
          const core = ctx.createLinearGradient(shipX - 200 * burn, y, shipX - 30, y);
          core.addColorStop(0, "transparent");
          core.addColorStop(0.6, `rgba(150,225,255,${0.35 * burn})`);
          core.addColorStop(1, `rgba(235,250,255,${0.95 * burn})`);
          polygon(
            ctx,
            [
              [shipX - 30, y - 3.5],
              [shipX - 60 - 150 * burn - Math.sin(elapsed * 33 + n) * 12, y],
              [shipX - 30, y + 3.5],
            ],
            core as unknown as string,
          );
        }
      }
      if (active && boostRatio > 0.1)
        glow(ctx, shipX - 50, shipY, 100 + boostRatio * 45, "#f5b65d18");
      for (let n = 0; n < 2; n++) {
        const y = shipY + (n ? 17 : -17);
        const gradient = ctx.createLinearGradient(
          shipX - 120 * thrust,
          y,
          shipX - 28,
          y,
        );
        gradient.addColorStop(0, "transparent");
        gradient.addColorStop(0.65, "#f5b65d33");
        gradient.addColorStop(1, "#ffddaacc");
        polygon(
          ctx,
          [
            [shipX - 30, y - 6],
            [shipX - 110 * thrust - Math.sin(elapsed * 21) * 9, y],
            [shipX - 30, y + 6],
          ],
          gradient as unknown as string,
        );
      }
      const recentCrew = [...s.crew]
        .sort((a, b) => b.lastAction - a.lastAction)
        .slice(0, 8);
      recentCrew.forEach((member, i) => {
        const a =
          elapsed * 0.14 + (i / Math.max(4, recentCrew.length)) * Math.PI * 2;
        const x = shipX + Math.cos(a) * 106;
        const y = shipY + Math.sin(a) * 87;
        const justActive =
          s.elapsed - member.lastAction < 1.8 &&
          s.elapsed - member.lastAction > -5;
        ctx.strokeStyle = `${member.color}${justActive ? "95" : "20"}`;
        ctx.lineWidth = justActive ? 1.4 : 0.6;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(shipX, shipY);
        ctx.stroke();
        glow(ctx, x, y, 17, `${member.color}25`);
        circle(ctx, x, y, 4, member.color);
        circle(ctx, x, y, 8, undefined, `${member.color}65`);
        if (justActive || s.phase === "ready")
          label(ctx, member.name, x, y - 15, member.color, 9, "center");
      });
      if (s.overdriveUntil > s.elapsed) {
        const a = 0.25 + Math.sin(elapsed * 4) * 0.08;
        glow(ctx, shipX, shipY, 210, `rgba(112,234,216,${a * 0.25})`);
        ctx.setLineDash([5, 10]);
        ctx.strokeStyle = `rgba(112,234,216,${a})`;
        ctx.lineWidth = 2;
        circle(ctx, shipX, shipY, 195, undefined, ctx.strokeStyle as string);
        ctx.setLineDash([]);
      }
      const surge = Math.max(0, 1 - (elapsed - shieldAt) / 0.7);
      if (s.ship.shield > 2 || surge > 0) {
        const shield = Math.min(1, s.ship.shield / 100 + surge * 0.6);
        glow(ctx, shipX, shipY, 95 + surge * 30, `rgba(112,234,216,${shield * 0.09 + surge * 0.18})`);
        ctx.save();
        ctx.translate(shipX, shipY);
        ctx.scale(1.35, 1);
        ctx.lineWidth = 1.2;
        circle(
          ctx,
          0,
          0,
          50,
          undefined,
          `rgba(112,234,216,${0.15 + shield * 0.55})`,
        );
        ctx.setLineDash([13, 16]);
        ctx.lineWidth = 2;
        ctx.rotate(elapsed * 0.12);
        circle(ctx, 0, 0, 55, undefined, `rgba(112,234,216,${shield * 0.35})`);
        ctx.restore();
      }
      // Rescue tug: readable silhouette, layered metal, illuminated cockpit.
      ctx.save();
      ctx.translate(shipX, shipY);
      ctx.rotate(s.ship.vy * 0.00065);
      ctx.globalAlpha =
        s.ship.invincible > 0 && Math.sin(elapsed * 40) > 0 ? 0.6 : 1;
      ctx.lineWidth = 1.2;
      polygon(
        ctx,
        [
          [-29, -22],
          [-4, -30],
          [22, -13],
          [47, -4],
          [47, 4],
          [22, 13],
          [-4, 30],
          [-29, 22],
          [-20, 8],
          [-20, -8],
        ],
        "#c9d4cf",
        "#edf2e6",
      );
      polygon(
        ctx,
        [
          [-4, -30],
          [22, -13],
          [0, -10],
          [-20, -18],
        ],
        "#63797d",
      );
      polygon(
        ctx,
        [
          [-4, 30],
          [22, 13],
          [0, 10],
          [-20, 18],
        ],
        "#465d64",
      );
      polygon(
        ctx,
        [
          [-5, -10],
          [20, -9],
          [33, 0],
          [20, 9],
          [-5, 10],
        ],
        "#102e38",
        "#5ebebf",
      );
      polygon(
        ctx,
        [
          [1, -6],
          [18, -6],
          [25, 0],
          [1, 0],
        ],
        "#70ead8a0",
      );
      ctx.fillStyle = "#f5b65d";
      ctx.fillRect(-22, -25, 9, 5);
      ctx.fillRect(-22, 20, 9, 5);
      ctx.fillStyle = "#243b43";
      ctx.fillRect(-34, -21, 12, 9);
      ctx.fillRect(-34, 12, 12, 9);
      ctx.restore();
      ctx.globalAlpha = 1;
      if (s.phase === "ready")
        label(ctx, "RSV-01  /  YOUR SHIP", shipX, shipY + 72, "#c4cec9", 9, "center");
      // Emit particles from real authoritative game events.
      for (const event of s.events) {
        if (event.id <= eventId) continue;
        eventId = event.id;
        if (s.elapsed - event.t > 2) continue;
        if (event.type === "hit" || event.type === "blocked") {
          impactAt = elapsed;
          impactBlocked = event.type === "blocked";
        }
        playSound(event.type, event.command);
        const who = event.name || "";
        const line = !who
          ? ""
          : event.type === "command"
            ? event.command === "shield"
              ? "SHIELD +18"
              : event.command === "boost"
                ? "BOOST"
                : "REPAIR +8"
            : event.type === "join"
              ? "JOINED"
              : event.type === "rejected"
                ? (event.text.split("· ")[1] ?? event.text)
                : "";
        const same = ticker.at(-1);
        if (same && same.name === who && same.text.replace(/ ×\d+$/, "") === line) {
          const n = Number(/ ×(\d+)$/.exec(same.text)?.[1] ?? 1) + 1;
          same.text = `${line} ×${n}`;
          same.born = elapsed;
        } else if (who && line)
          ticker.push({
            name: who,
            text: line,
            color: event.color || "#8b9aa4",
            born: elapsed,
            dim: event.type === "rejected",
          });
        if (ticker.length > 3) ticker = ticker.slice(-3);
        if (event.type === "command" && event.command === "boost") {
          boostAt = elapsed;
          flashAt = elapsed;
          flashColor = "#f5b65d";
          flashPower = 0.22;
          shakeAt = elapsed;
          shakePower = 2;
        } else if (event.type === "command" && event.command === "shield") {
          shieldAt = elapsed;
          pulse({ x: shipX, y: shipY, color: "#70ead8", born: elapsed, life: 0.6, from: 40, to: 110, width: 3, hex: true, attached: true });
        } else if (event.type === "command" && event.command === "repair") {
          pulse({ x: shipX, y: shipY, color: "#c2a2ff", born: elapsed, life: 0.5, from: 30, to: 80, width: 2, attached: true });
        } else if (event.type === "hit") {
          shakeAt = elapsed;
          shakePower = 9;
          flashAt = elapsed;
          flashColor = "#fb7c70";
          flashPower = 0.35;
          const damage = /(\d+) damage/.exec(event.text)?.[1];
          shout({ text: `HULL −${damage ?? ""}`, color: "#fb7c70", born: elapsed, x: shipX, y: shipY - 92, attached: true });
        } else if (event.type === "blocked") {
          shakeAt = elapsed;
          shakePower = 3;
          shieldAt = elapsed;
          // Ripple where the asteroid met the shield bubble.
          const a = Math.atan2((event.y ?? shipY) - shipY, (event.x ?? shipX) - shipX);
          rings.push({ x: shipX + Math.cos(a) * 62, y: shipY + Math.sin(a) * 50, color: "#70ead8", born: elapsed, life: 0.5, from: 6, to: 46, width: 3 });
          shout({ text: "BLOCKED", color: "#70ead8", born: elapsed, x: shipX, y: shipY - 92, attached: true });
        } else if (event.type === "rescue") {
          shakeAt = elapsed;
          shakePower = 3;
          flashAt = elapsed;
          flashColor = "#f5b65d";
          flashPower = 0.18;
          rings.push({ x: event.x ?? shipX, y: event.y ?? shipY, color: "#f5b65d", born: elapsed, life: 0.9, from: 20, to: 190, width: 4 });
          const survivors = /(\d+) survivors/.exec(event.text)?.[1];
          floats.push({ text: `+${survivors ?? ""} SURVIVORS`, sub: `${event.text.split(" ")[0]} RESCUED`, color: "#f5b65d", born: elapsed, x: W / 2, y: 250, big: true });
        } else if (event.type === "sync") {
          shakeAt = elapsed;
          shakePower = 5;
          flashAt = elapsed;
          flashColor = "#70ead8";
          flashPower = 0.3;
          pulse({ x: shipX, y: shipY, color: "#70ead8", born: elapsed, life: 1.1, from: 40, to: 260, width: 5, attached: true });
        }
        if (floats.length > 3) floats = floats.slice(-3);
        if (
          ["rescue", "hit", "blocked", "command", "sync"].includes(event.type)
        ) {
          const color =
            event.type === "rescue"
              ? "#f5b65d"
              : event.type === "hit"
                ? "#fb7c70"
                : event.color || "#70ead8";
          for (let i = 0; i < (event.type === "command" ? 10 : 42); i++) {
            const a = i * 2.4;
            const life = 0.6 + Math.random() * 0.8;
            particles.push({
              x: event.x ?? shipX,
              y: event.y ?? shipY,
              vx: Math.cos(a) * (30 + Math.random() * 120),
              vy: Math.sin(a) * (30 + Math.random() * 120),
              life,
              max: life,
              color,
              r: 1 + Math.random() * 2,
            });
          }
        }
      }
      particles = particles.filter((p) => p.life > 0);
      for (const p of particles) {
        p.life -= dt;
        p.x += (p.vx - (active ? 40 : 0)) * dt;
        p.y += p.vy * dt;
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        circle(ctx, p.x, p.y, p.r, p.color);
      }
      ctx.globalAlpha = 1;
      const impactAge = elapsed - impactAt;
      if (impactAge < 0.9) {
        const color = impactBlocked ? "#70ead8" : "#fb7c70";
        ctx.globalAlpha = 1 - impactAge / 0.9;
        ctx.lineWidth = 3;
        circle(ctx, shipX, shipY, 50 + impactAge * 75, undefined, color);
        ctx.globalAlpha = 1;
      }
      // Shockwaves: shield activation (hexagonal), rescue, ALL HANDS and shield ripples.
      rings = rings.filter((r) => elapsed - r.born < r.life);
      for (const r of rings) {
        const p = (elapsed - r.born) / r.life;
        const radius = r.from + (r.to - r.from) * (1 - (1 - p) ** 3);
        const rx = r.attached ? shipX : r.x,
          ry = r.attached ? shipY : r.y;
        ctx.globalAlpha = (1 - p) * 0.9;
        ctx.strokeStyle = r.color;
        ctx.lineWidth = r.width * (1 - p * 0.6);
        ctx.beginPath();
        if (r.hex)
          for (let i = 0; i <= 6; i++) {
            const a = (i / 6) * Math.PI * 2 + elapsed * 0.8;
            const x = rx + Math.cos(a) * radius * 1.3,
              y = ry + Math.sin(a) * radius;
            if (i) ctx.lineTo(x, y);
            else ctx.moveTo(x, y);
          }
        else ctx.arc(rx, ry, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // Boost burst: a rush of speed lines for the first moments of every !boost.
      const boostAge = elapsed - boostAt;
      if (boostAge < 0.9) {
        const k = 1 - boostAge / 0.9;
        ctx.strokeStyle = `rgba(255,214,150,${0.55 * k})`;
        for (let i = 0; i < 26; i++) {
          const y = (i * 97 + 31) % H;
          const x = (W - ((boostAge * 2600 + i * 211) % (W + 400))) | 0;
          ctx.lineWidth = 1 + (i % 3);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + 120 + (i % 5) * 40, y);
          ctx.stroke();
        }
        glow(ctx, shipX - 60, shipY, 140 * (0.6 + k), `rgba(245,182,93,${0.35 * k})`);
      }
      ctx.restore();
      // Full-frame flash for hits, boosts, rescues and ALL HANDS.
      const flashAge = elapsed - flashAt;
      if (flashAge < 0.5 && !reduceMotion) {
        const edge = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.7);
        edge.addColorStop(0, "transparent");
        edge.addColorStop(1, flashColor);
        ctx.globalAlpha = flashPower * (1 - flashAge / 0.5);
        ctx.fillStyle = edge;
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
      }
      // Flight HUD kept inside the image for OBS parity: four calm cards, nothing else.
      const vignette = ctx.createRadialGradient(W / 2, H / 2, H / 3, W / 2, H / 2, W * 0.65);
      vignette.addColorStop(0, "transparent");
      vignette.addColorStop(1, "#050a12a0");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, W, H);
      const over = s.phase === "won" || s.phase === "lost";
      // 1. Source card (top left): the honesty label plus crew size.
      {
        const live = s.mode === "live";
        const text = `${live ? "TWITCH LIVE" : "REHEARSAL · SIMULATED"}  ·  ${s.crew.length} CREW`;
        mono(ctx, 15);
        const w = ctx.measureText(text).width + 44;
        card(ctx, 20, 18, w, 36);
        circle(ctx, 38, 36, 5, live ? "#70ead8" : "#f5b65d");
        ctx.textAlign = "left";
        ctx.fillStyle = live ? "#9ff0e2" : "#f5c27a";
        ctx.fillText(text, 52, 41);
      }
      // 2. One status banner (top centre), highest priority wins.
      if (!over && s.phase !== "ready" && s.countdown <= 0) {
        const pulseLeft = (s.overdriveUntil - s.elapsed) / 6;
        const banner =
          pulseLeft > 0
            ? { text: "ALL HANDS  ·  RESCUE RANGE ×2", color: "#70ead8", fill: pulseLeft }
            : s.ship.hull < 35
              ? { text: "HULL CRITICAL  ·  CHAT: !repair", color: "#fb7c70", fill: s.ship.hull / 100 }
              : s.storm
                ? { text: "DEBRIS STORM  ·  CHAT: !shield", color: "#f5b65d", fill: 0 }
                : boostRatio > 0.1
                  ? { text: `${burn > 0.3 ? "BOOST + AFTERBURNER" : "BOOST"}  ·  ${(velocity / 10).toFixed(1)} KM/S`, color: "#f5b65d", fill: s.ship.boost / 100 }
                  : burn > 0.3
                    ? { text: `AFTERBURNER  ·  ${(velocity / 10).toFixed(1)} KM/S`, color: "#9fe2ff", fill: burn }
                    : null;
        if (banner) {
          mono(ctx, 17, 500);
          const w = ctx.measureText(banner.text).width + 48;
          const x = W / 2 - w / 2;
          const blink = banner.color === "#fb7c70" ? 0.75 + Math.sin(elapsed * 8) * 0.25 : 1;
          ctx.globalAlpha = blink;
          card(ctx, x, 16, w, 42, "#070d15d9", `${banner.color}88`);
          ctx.textAlign = "center";
          ctx.fillStyle = banner.color;
          ctx.fillText(banner.text, W / 2, 43);
          if (banner.fill > 0) {
            ctx.fillStyle = `${banner.color}66`;
            ctx.fillRect(x + 16, 52, (w - 32) * clampN(banner.fill, 0, 1), 2);
          }
          ctx.globalAlpha = 1;
        }
      }
      // 3. Crew cards (top right): the three most recent actions, named.
      ticker = ticker.filter((t) => elapsed - t.born < 6);
      if (!over)
        ticker.forEach((t, i) => {
          const y = 18 + i * 42;
          const a = Math.min(1, (elapsed - t.born) * 6) * Math.min(1, (6 - (elapsed - t.born)) * 1.5);
          ctx.globalAlpha = a * (t.dim ? 0.8 : 1);
          mono(ctx, 15, 500);
          const nameW = ctx.measureText(t.name).width;
          mono(ctx, 15);
          const actionW = ctx.measureText(t.text).width;
          const w = nameW + actionW + 50;
          const x = W - 20 - w;
          card(ctx, x, y, w, 36, "#070d15d4", t.dim ? "#ffffff14" : `${t.color}55`);
          circle(ctx, x + 16, y + 18, 5, t.dim ? "#5d6b74" : t.color);
          ctx.textAlign = "left";
          mono(ctx, 15, 500);
          ctx.fillStyle = t.dim ? "#9aa8b0" : t.color;
          ctx.fillText(t.name, x + 29, y + 23);
          mono(ctx, 15);
          ctx.fillStyle = t.dim ? "#8b979e" : "#ece9df";
          ctx.fillText(t.text, x + 38 + nameW, y + 23);
        });
      ctx.globalAlpha = 1;
      // 4. Ship card (bottom): hull and shield, the route to the gate, pods.
      if (!over) {
        const y = H - 72;
        card(ctx, 20, y, W - 40, 56);
        const bar = (x: number, name: string, value: number, color: string) => {
          mono(ctx, 13);
          ctx.textAlign = "left";
          ctx.fillStyle = "#93a5ae";
          ctx.fillText(name, x, y + 23);
          mono(ctx, 16, 500);
          ctx.textAlign = "right";
          ctx.fillStyle = color;
          ctx.fillText(`${Math.ceil(value)}%`, x + 160, y + 23);
          ctx.fillStyle = "#26343e";
          ctx.fillRect(x, y + 34, 160, 6);
          ctx.fillStyle = color;
          ctx.fillRect(x, y + 34, 1.6 * clampN(value, 0, 100), 6);
        };
        bar(42, "HULL", s.ship.hull, s.ship.hull < 35 ? "#fb7c70" : "#e3e8df");
        bar(226, "SHIELD", s.ship.shield, "#70ead8");
        const routeX = 430,
          routeW = 410,
          routeY = y + 28;
        const at = routeX + Math.min(1, s.distance / WORLD.distance) * routeW;
        ctx.strokeStyle = "#34454c";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(routeX, routeY);
        ctx.lineTo(routeX + routeW, routeY);
        ctx.stroke();
        ctx.strokeStyle = "#f5b65d";
        ctx.beginPath();
        ctx.moveTo(routeX, routeY);
        ctx.lineTo(at, routeY);
        ctx.stroke();
        for (const pod of s.pods)
          circle(
            ctx,
            routeX + (pod.x / WORLD.distance) * routeW,
            routeY,
            5,
            pod.status === "rescued" ? "#70ead8" : pod.status === "missed" ? "#fb7c70" : "#a08b64",
          );
        ctx.lineWidth = 2;
        circle(ctx, routeX + routeW, routeY, 7, undefined, "#70ead8");
        polygon(ctx, [[at - 6, routeY - 6], [at + 8, routeY], [at - 6, routeY + 6]], "#f5b65d");
        mono(ctx, 21, 500);
        ctx.textAlign = "right";
        ctx.fillStyle = "#f5b65d";
        ctx.fillText(`${s.rescued}/3 PODS`, W - 40, y + 26);
        mono(ctx, 13);
        ctx.fillStyle = "#93a5ae";
        ctx.fillText(`${s.people} SURVIVORS`, W - 40, y + 45);
      }
      // Callouts: impacts follow the ship; rescues and launch take the centre.
      floats = floats.filter((f) => elapsed - f.born < 1.6);
      floats.forEach((f, i) => {
        const p = (elapsed - f.born) / 1.6;
        const stack = floats.filter((o, j) => j > i && !o.big).length;
        const above = shipY > 200;
        const fx = f.attached ? clampN(shipX, 140, W - 330) : f.x;
        const y = f.attached
          ? above
            ? shipY - 122 - p * 22 - stack * 34
            : shipY + 132 + p * 18 + stack * 34
          : f.y - p * 34;
        ctx.globalAlpha = Math.min(1, (1 - p) * 2.2);
        const pop = 1 + Math.max(0, 0.25 - p) * 1.4;
        ctx.textAlign = "center";
        ctx.font = `500 ${Math.round((f.big ? 34 : 20) * pop)}px "Space Grotesk", sans-serif`;
        ctx.fillStyle = "#070d15";
        ctx.fillText(f.text, fx + 1.5, y + 1.5);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, fx, y);
        if (f.sub) label(ctx, f.sub, fx, y + (f.big ? 24 : 18), "#e8e6dc", 10, "center");
      });
      ctx.globalAlpha = 1;
      if (s.phase === "ready")
        label(ctx, "TYPE !join IN CHAT TO BOARD", shipX, shipY + 128, "#70ead8", 11, "center");
      if (s.countdown > 0 && s.phase === "running") {
        const count = Math.ceil(s.countdown);
        if (count !== lastCount) {
          lastCount = count;
          playSound("tick");
        }
        const frac = s.countdown - Math.floor(s.countdown);
        ctx.fillStyle = "#050a1299";
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = "#f5b65d";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(W / 2, H / 2 - 8, 92, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (frac || 1));
        ctx.stroke();
        circle(ctx, W / 2, H / 2 - 8, 104, undefined, "#f5b65d30");
        label(ctx, "CREW, TAKE YOUR STATIONS", W / 2, H / 2 - 130, "#f5b65d", 13, "center");
        label(ctx, "CHAT CAN PRECHARGE NOW", W / 2, H / 2 + 132, "#cfd8d4", 11, "center");
        ctx.textAlign = "center";
        ctx.font = `${Math.round(84 + (1 - frac) * 26)}px "Space Grotesk", sans-serif`;
        ctx.fillStyle = "#f2f0e7";
        ctx.fillText(String(count), W / 2, H / 2 + 22);
      } else if (lastCount === 1 && running) {
        lastCount = 0;
        playSound("go");
        floats.push({ text: "LAUNCH", color: "#f5b65d", born: elapsed, x: W / 2, y: H / 2, big: true });
      } else if (!running) lastCount = s.phase === "running" ? lastCount : 0;
      animation = requestAnimationFrame(render);
    };
    animation = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animation);
  }, []);
  useEffect(() => {
    if (spectator || !onInput) return;
    const keys = new Set<string>();
    let focused = false;
    const input = () => {
      const held = {
        up: keys.has("w") || keys.has("arrowup"),
        down: keys.has("s") || keys.has("arrowdown"),
        left: keys.has("a") || keys.has("arrowleft"),
        right: keys.has("d") || keys.has("arrowright"),
      };
      localInput.current = held;
      inputCallback.current?.(held);
    };
    const reset = () => {
      keys.clear();
      input();
    };
    const keydown = (e: KeyboardEvent) => {
      if (
        !focused ||
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      const key = e.key.toLowerCase();
      if (
        [
          "w",
          "a",
          "s",
          "d",
          "arrowup",
          "arrowdown",
          "arrowleft",
          "arrowright",
          " ",
        ].includes(key)
      ) {
        e.preventDefault();
        if (key === " " && !e.repeat) pauseCallback.current?.();
        else {
          keys.add(key);
          input();
        }
      }
    };
    const keyup = (e: KeyboardEvent) => {
      if (keys.delete(e.key.toLowerCase())) {
        e.preventDefault();
        input();
      }
    };
    const el = canvas.current!;
    const focus = () => {
      focused = true;
    };
    const blur = () => {
      focused = false;
      reset();
    };
    el.addEventListener("focus", focus);
    el.addEventListener("blur", blur);
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", blur);
    const timer = setInterval(() => {
      if (focused) input();
    }, 150);
    return () => {
      clearInterval(timer);
      reset();
      el.removeEventListener("focus", focus);
      el.removeEventListener("blur", blur);
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", blur);
    };
  }, [spectator, Boolean(onInput)]);
  return (
    <canvas
      ref={canvas}
      className="space-canvas"
      tabIndex={spectator ? -1 : 0}
      onPointerDown={(e) => e.currentTarget.focus()}
      aria-label="Rescue flight. Click to pilot with W A S D or arrow keys. Fly into amber rings to rescue survivors. Space pauses."
      data-testid="flight-canvas"
    />
  );
}
