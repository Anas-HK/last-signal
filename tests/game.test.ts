import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../server/game.js";
import { BALANCE, debrisScale, parseCommand, WORLD } from "../shared/types.js";
function launch(mode: "demo" | "live" = "demo") {
  const g = new Game();
  g.reset(mode);
  g.state.simulation = false;
  g.start();
  for (let i = 0; i < 92; i++) g.tick(1 / 30);
  return g;
}
test("chat parser accepts exact commands and rejects lookalikes", () => {
  assert.equal(parseCommand(" !SHIELD "), "shield");
  assert.equal(parseCommand("!repair please"), "repair");
  for (const text of [
    "shield",
    "!shielded",
    "hi !boost",
    "!repair<script>",
    "!boost!",
    "",
  ])
    assert.equal(parseCommand(text), null);
});
test("real viewers can crew the ready ship and recharge between lobby commands", () => {
  const g = new Game();
  g.reset("live");
  assert.equal(g.command("real", "Viewer", "shield", false).accepted, true);
  assert.equal(g.state.ship.shield, 38);
  assert.equal(g.state.crew[0].simulated, false);
  assert.equal(g.command("real", "Viewer", "boost", false).accepted, false);
  for (let i = 0; i < 61; i++) g.tick(1 / 30);
  assert.equal(g.command("real", "Viewer", "boost", false).accepted, true);
  assert.equal(g.state.ship.boost, 22);
  assert.equal(g.state.distance, 0);
});
test("boost causes measurable acceleration and greater travel distance, then decays to cruise", () => {
  const normal = launch(),
    boosted = launch();
  normal.state.rocks = [];
  boosted.state.rocks = [];
  boosted.command("engineer", "Engineer", "boost", true);
  const a = normal.state.distance,
    b = boosted.state.distance;
  for (let i = 0; i < 30; i++) {
    normal.tick(1 / 30);
    boosted.tick(1 / 30);
  }
  assert.ok(boosted.state.ship.speed > 100);
  assert.equal(normal.state.ship.speed, BALANCE.cruise);
  assert.ok(boosted.state.distance - b > (normal.state.distance - a) * 1.6);
  for (let i = 0; i < 240; i++) boosted.tick(1 / 30);
  assert.ok(boosted.state.ship.speed < BALANCE.cruise + 1);
});
test("countdown, pause and terminal state freeze mission simulation", () => {
  const g = new Game();
  g.start();
  g.tick(0.1);
  assert.equal(g.state.distance, 0);
  for (let i = 0; i < 32; i++) g.tick(0.1);
  const distance = g.state.distance;
  g.pause();
  g.tick(0.1);
  assert.equal(g.state.distance, distance);
  g.pause();
  g.tick(0.1);
  assert.ok(g.state.distance > distance);
  g.state.ship.hull = 0;
  g.tick(0.1);
  assert.equal(g.state.phase, "lost");
  const time = g.state.elapsed;
  g.tick(0.1);
  assert.equal(g.state.elapsed, time);
});
test("crew commands change physics resources, cap values, enforce cooldown and separate sources", () => {
  const g = launch();
  g.state.ship.shield = 90;
  assert.equal(g.command("a", "Alice", "shield", true).accepted, true);
  assert.equal(g.state.ship.shield, 100);
  assert.equal(g.state.crew[0].points, 10);
  assert.equal(g.command("a", "Alice", "boost", true).accepted, false);
  assert.equal(g.command("real", "Bob", "boost", false).accepted, false);
  for (let i = 0; i < 61; i++) g.tick(1 / 30);
  assert.equal(g.command("a", "Alice", "boost", true).accepted, true);
  assert.equal(g.state.crew.length, 1);
  const live = launch("live");
  assert.equal(live.command("a", "A", "shield", true).accepted, false);
  assert.equal(live.command("b", "B", "shield", false).accepted, true);
});
test("three distinct viewers link ALL HANDS and expand the real rescue radius", () => {
  const g = launch();
  g.state.ship.hull = 70;
  g.state.ship.shield = 0;
  g.state.ship.boost = 0;
  g.command("a", "Alice", "shield", true);
  g.command("b", "Bob", "boost", true);
  g.command("c", "Casey", "repair", true);
  assert.equal(g.state.bursts, 1);
  assert.ok(g.state.overdriveUntil > g.state.elapsed);
  assert.equal(g.state.links.length, 0);
  assert.equal(g.state.crew[0].points, 58);
  const pod = g.state.pods[0];
  pod.x = g.state.distance + g.state.ship.x + 150;
  pod.y = g.state.ship.y;
  g.tick(1 / 30);
  assert.equal(pod.status, "rescued");
  assert.equal(g.state.people, 4);
});
test("one viewer cannot impersonate a synchronized team and expired links disappear", () => {
  const g = launch();
  g.state.ship.hull = 60;
  g.command("a", "Alice", "shield", true);
  for (let i = 0; i < 61; i++) g.tick(1 / 30);
  g.command("a", "Alice", "boost", true);
  for (let i = 0; i < 61; i++) g.tick(1 / 30);
  g.command("a", "Alice", "repair", true);
  assert.equal(g.state.bursts, 0);
  assert.equal(g.state.links.length, 1);
  for (let i = 0; i < 190; i++) g.tick(1 / 30);
  assert.equal(g.state.links.length, 0);
});
test("input moves the ship and bounds prevent escape from the flight area", () => {
  const g = launch();
  g.state.rocks = [];
  g.input = { up: true, down: false, left: true, right: false };
  for (let i = 0; i < 300; i++) g.tick(1 / 30);
  assert.equal(g.state.ship.x, 85);
  assert.equal(g.state.ship.y, 85);
});
test("an impact consumes shields before hull and the shield block is credited", () => {
  const g = launch();
  g.state.ship.shield = 50;
  const hull = g.state.ship.hull;
  g.state.rocks = [
    {
      id: 1,
      x: g.state.distance + g.state.ship.x + 2,
      y: g.state.ship.y,
      r: 20,
      rotation: 0,
      hit: false,
      speed: 0,
    },
  ];
  g.tick(1 / 30);
  assert.equal(g.state.blocked, 1);
  // A solo pilot takes scaled debris damage (17 x 0.4); shields still absorb it before the hull.
  assert.ok(g.state.ship.shield < 50 - 17 * debrisScale(0) + 0.5);
  assert.ok(g.state.ship.hull > hull - 0.01);
});
test("debris damage scales with crew size and reaches full strength at five crew", () => {
  const solo = launch("live");
  const crewed = launch("live");
  for (const name of ["a", "b", "c", "d", "e"]) crewed.chat(name, name, "join", false);
  for (const g of [solo, crewed]) {
    g.tick(1 / 30);
    g.state.ship.shield = 0;
    g.state.rocks = [{ id: 1, x: g.state.distance + g.state.ship.x + 2, y: g.state.ship.y, r: 20, rotation: 0, hit: false, speed: 0 }];
    g.tick(1 / 30);
  }
  assert.equal(solo.state.debris, BALANCE.debrisFloor);
  assert.equal(crewed.state.debris, 1);
  assert.ok(100 - solo.state.ship.hull < 9);
  assert.ok(100 - crewed.state.ship.hull > 16);
});
test("cruise alone reaches the jump gate inside the window; a solo pilot is not time-locked", () => {
  assert.ok(WORLD.distance / BALANCE.cruise < WORLD.duration - 3);
});
test("!join boards a lobby crew on the least-staffed station without spending a charge", () => {
  const g = new Game();
  g.reset("live");
  const shield = g.state.ship.shield;
  assert.equal(g.chat("1", "Ada", "join", false).accepted, true);
  assert.equal(g.chat("2", "Bo", "join", false).accepted, true);
  assert.equal(g.chat("3", "Cy", "join", false).accepted, true);
  assert.deepEqual(new Set(g.state.crew.map((c) => c.role)), new Set(["shield", "boost", "repair"]));
  assert.equal(g.state.ship.shield, shield);
  assert.equal(g.chat("1", "Ada", "join", false).accepted, false);
  assert.equal(g.state.events.filter((e) => e.type === "join").length, 3);
  assert.equal(parseCommand("!join"), "join");
  assert.equal(parseCommand("!boost go"), "boost");
});
test("commands during the countdown precharge the ship instead of being rejected", () => {
  const g = new Game();
  g.reset("live");
  g.start();
  g.tick(1 / 30);
  assert.ok(g.state.countdown > 0);
  assert.equal(g.chat("v", "Viewer", "boost", false).accepted, true);
  assert.equal(g.state.ship.boost, 22);
});
test("rejected chat commands are announced once per viewer, never flooding the feed", () => {
  const g = launch("live");
  g.state.ship.hull = 100;
  assert.equal(g.chat("v", "Viewer", "repair", false).accepted, false);
  assert.equal(g.chat("v", "Viewer", "repair", false).accepted, false);
  const rejected = g.state.events.filter((e) => e.type === "rejected");
  assert.equal(rejected.length, 1);
  assert.match(rejected[0].text, /hull already full/);
  assert.equal(rejected[0].name, "Viewer");
  for (let i = 0; i < 20; i++) g.chat(`x${i}`, `x${i}`, "repair", false);
  assert.ok(g.state.events.filter((e) => e.type === "rejected").length <= 4);
});
test("the exported history keeps the whole mission, beyond the 70 recent events", () => {
  const g = launch();
  for (let i = 0; i < 200; i++) g.event("system", `entry ${i}`);
  assert.equal(g.state.events.length, 70);
  assert.ok(g.history.length >= 201);
  assert.equal(g.history.find((e) => e.text === "entry 0")?.text, "entry 0");
});
test("the reproducible rehearsal completes all rescues with genuine simulation physics", () => {
  const g = new Game();
  g.state.autopilot = true;
  g.start();
  for (let i = 0; i < 4200; i++) g.tick(1 / 30);
  assert.equal(g.state.phase, "won");
  assert.equal(g.state.rescued, 3);
  assert.equal(g.state.people, 13);
  assert.ok(g.state.actions > 30);
  assert.ok(g.state.blocked > 0);
  assert.ok(g.state.distance >= WORLD.distance);
  assert.ok(g.state.elapsed < WORLD.duration);
  assert.ok(g.state.crew.every((c) => c.simulated));
});
test("unassisted flight can lose; the game does not fabricate a rescue", () => {
  const g = launch("live");
  g.state.rocks = [];
  g.state.ship.y = 85;
  for (let i = 0; i < 4000; i++) g.tick(1 / 30);
  assert.equal(g.state.phase, "lost");
  assert.equal(g.state.rescued, 0);
  assert.equal(g.state.crew.length, 0);
});
test("chat bursts are rate limited and state storage remains bounded", () => {
  const g = launch();
  let accepted = 0;
  for (let i = 0; i < 40; i++) {
    g.state.ship.shield = 0;
    if (g.command(String(i), "viewer", "shield", true).accepted) accepted++;
  }
  assert.equal(accepted, 15);
  for (let i = 0; i < 200; i++) g.event("system", "test");
  assert.equal(g.state.events.length, 70);
});
