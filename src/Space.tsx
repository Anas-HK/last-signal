import { useEffect, useRef } from "react";
import type { GameState, Input } from "../shared/types";
import { COLORS, WORLD } from "../shared/types";
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
  ctx.font = `${size}px "JetBrains Mono", monospace`;
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
  latest.current = game;
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
      const boostRatio = Math.max(0, Math.min(1, (velocity - 53) / 52));
      if (id !== s.id) {
        id = s.id;
        eventId = 0;
        particles = [];
        shipX = s.ship.x;
        shipY = s.ship.y;
        distance = s.distance;
      }
      const lerp = Math.min(1, dt * 18);
      shipX += ((s.phase === "ready" ? 720 : s.ship.x) - shipX) * lerp;
      shipY += ((s.phase === "ready" ? 380 : s.ship.y) - shipY) * lerp;
      distance += (s.distance - distance) * lerp;
      const dpr = el.width / W;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#070d15";
      ctx.fillRect(0, 0, W, H);
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
        if (active && boostRatio > 0.05) {
          ctx.strokeStyle = "#bcd9d8";
          ctx.lineWidth = star.r;
          ctx.beginPath();
          ctx.moveTo(x, star.y);
          ctx.lineTo(x + boostRatio * (20 + star.r * 20), star.y);
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
        label(
          ctx,
          "▲  DEBRIS STORM · SHIELDS RECOMMENDED",
          W / 2,
          86,
          "#f5b65d",
          11,
          "center",
        );
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
        label(
          ctx,
          `${pod.name} · ${pod.people} SURVIVORS`,
          x,
          pod.y - 105,
          "#f5c27a",
          11,
          "center",
        );
        label(
          ctx,
          "FLY INTO THE RING TO RESCUE",
          x,
          pod.y + 108,
          "#8e9da5",
          9,
          "center",
        );
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
        label(ctx, `${nextPod.name} →`, W - 48, y + 4, "#f5b65d", 10, "right");
        label(
          ctx,
          `${Math.max(0, Math.round((nextPod.x - distance - shipX) / 10))} km`,
          W - 48,
          y + 21,
          "#8b9aa4",
          9,
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
      const thrust = active ? 1 + boostRatio * 2.3 : 0.45;
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
        label(
          ctx,
          "ALL HANDS // RESCUE PULSE",
          W / 2,
          116,
          "#70ead8",
          16,
          "center",
        );
        label(
          ctx,
          "TRACTOR RANGE DOUBLED · CREW SYNC ACTIVE",
          W / 2,
          137,
          "#9abfb7",
          9,
          "center",
        );
      }
      if (s.ship.shield > 2) {
        const shield = s.ship.shield / 100;
        glow(ctx, shipX, shipY, 95, `rgba(112,234,216,${shield * 0.09})`);
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
      label(
        ctx,
        "RSV-01  /  YOUR SHIP",
        shipX,
        shipY + 72,
        "#c4cec9",
        9,
        "center",
      );
      // Emit particles from real authoritative game events.
      for (const event of s.events) {
        if (event.id <= eventId) continue;
        eventId = event.id;
        if (s.elapsed - event.t > 2) continue;
        if (event.type === "hit" || event.type === "blocked") {
          impactAt = elapsed;
          impactBlocked = event.type === "blocked";
        }
        playSound(event.type);
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
        label(
          ctx,
          impactBlocked ? "IMPACT BLOCKED" : "HULL HIT · SEND !REPAIR",
          shipX,
          shipY - 100,
          color,
          13,
          "center",
        );
        ctx.globalAlpha = 1;
      }
      // Flight HUD kept inside the image for OBS parity.
      const vignette = ctx.createRadialGradient(
        W / 2,
        H / 2,
        H / 3,
        W / 2,
        H / 2,
        W * 0.65,
      );
      vignette.addColorStop(0, "transparent");
      vignette.addColorStop(1, "#050a12a0");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, W, H);
      label(ctx, "SECTOR 07 / THE QUIET REACH", 30, 35, "#a3b4b7", 10);
      if (s.phase !== "ready")
        label(
          ctx,
          `${boostRatio > 0.1 ? "BOOST ACTIVE" : "CRUISE"}  //  ${(velocity / 10).toFixed(1)} KM/S`,
          W / 2,
          35,
          boostRatio > 0.1 ? "#f5b65d" : "#8b9aa4",
          12,
          "center",
        );
      label(
        ctx,
        s.mode === "demo"
          ? "REHEARSAL · SIMULATED CHAT"
          : "TWITCH LIVE · VIEWER CREW",
        W - 30,
        35,
        s.mode === "demo" ? "#f5b65d" : "#70ead8",
        10,
        "right",
      );
      label(ctx, "HULL", 30, H - 54, "#8b9aa4", 9);
      label(
        ctx,
        `${Math.ceil(s.ship.hull)}%`,
        175,
        H - 54,
        s.ship.hull < 35 ? "#fb7c70" : "#dce3da",
        11,
        "right",
      );
      ctx.fillStyle = "#26343e";
      ctx.fillRect(30, H - 43, 145, 4);
      ctx.fillStyle = s.ship.hull < 35 ? "#fb7c70" : "#dce3da";
      ctx.fillRect(30, H - 43, s.ship.hull * 1.45, 4);
      label(ctx, "SHIELD", 205, H - 54, "#8b9aa4", 9);
      label(
        ctx,
        `${Math.ceil(s.ship.shield)}%`,
        350,
        H - 54,
        "#70ead8",
        11,
        "right",
      );
      ctx.fillStyle = "#26343e";
      ctx.fillRect(205, H - 43, 145, 4);
      ctx.fillStyle = "#70ead8";
      ctx.fillRect(205, H - 43, s.ship.shield * 1.45, 4);
      label(
        ctx,
        `${String(s.rescued).padStart(2, "0")} / 03 PODS`,
        W - 30,
        H - 51,
        "#f5b65d",
        13,
        "right",
      );
      label(
        ctx,
        `${s.people} SURVIVORS ABOARD`,
        W - 30,
        H - 30,
        "#8b9aa4",
        9,
        "right",
      );
      // Route strip: pod y coordinates are also communicated by arrows in the field.
      const routeX = 414,
        routeW = 350;
      const routeY = H - 39;
      ctx.strokeStyle = "#34454c";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(routeX, routeY);
      ctx.lineTo(routeX + routeW, routeY);
      ctx.stroke();
      ctx.strokeStyle = "#f5b65d";
      ctx.beginPath();
      ctx.moveTo(routeX, routeY);
      ctx.lineTo(
        routeX + Math.min(1, s.distance / WORLD.distance) * routeW,
        routeY,
      );
      ctx.stroke();
      s.pods.forEach((p) => {
        const x = routeX + (p.x / WORLD.distance) * routeW;
        circle(
          ctx,
          x,
          routeY,
          4,
          p.status === "rescued"
            ? "#70ead8"
            : p.status === "missed"
              ? "#fb7c70"
              : "#a08b64",
        );
      });
      circle(
        ctx,
        routeX + Math.min(1, s.distance / WORLD.distance) * routeW,
        routeY,
        4,
        "#f5b65d",
      );
      label(ctx, "DISTRESS SIGNALS", routeX, H - 56, "#8b9aa4", 9);
      label(ctx, "JUMP GATE", routeX + routeW, H - 56, "#8b9aa4", 9, "right");
      if (s.countdown > 0 && s.phase === "running") {
        ctx.fillStyle = "#050a1280";
        ctx.fillRect(0, 0, W, H);
        label(
          ctx,
          "CREW, TAKE YOUR STATIONS",
          W / 2,
          H / 2 - 55,
          "#f5b65d",
          12,
          "center",
        );
        ctx.textAlign = "center";
        ctx.font = '80px "Space Grotesk", sans-serif';
        ctx.fillStyle = "#f2f0e7";
        ctx.fillText(String(Math.ceil(s.countdown)), W / 2, H / 2 + 30);
      }
      animation = requestAnimationFrame(render);
    };
    animation = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animation);
  }, []);
  useEffect(() => {
    if (spectator || !onInput) return;
    const keys = new Set<string>();
    let focused = false;
    const input = () =>
      inputCallback.current?.({
        up: keys.has("w") || keys.has("arrowup"),
        down: keys.has("s") || keys.has("arrowdown"),
        left: keys.has("a") || keys.has("arrowleft"),
        right: keys.has("d") || keys.has("arrowright"),
      });
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
