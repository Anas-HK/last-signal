import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../server/game.js";
import { parseCommand, WORLD } from "../shared/types.js";
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
  assert.equal(normal.state.ship.speed, 53);
  assert.ok(boosted.state.distance - b > (normal.state.distance - a) * 1.6);
  for (let i = 0; i < 240; i++) boosted.tick(1 / 30);
  assert.ok(boosted.state.ship.speed < 54);
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
  assert.ok(g.state.ship.shield < 34);
  assert.ok(g.state.ship.hull > hull - 0.01);
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
