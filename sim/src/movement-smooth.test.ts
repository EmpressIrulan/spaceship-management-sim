import { describe, expect, it } from "vitest";
import { separateTraffic } from "./movement";
import { createInitialState } from "./state";
import { miningStart } from "./test-ships";
import { tick } from "./tick";
import type { Bug, Ship, SimState, StationModule, Vec } from "./model";

const ship = (id: number, from: Vec, to: Vec, along: number): Ship => {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const f = along / length;
  return {
    id, design: { width: 2, height: 2, slots: ["Engine", "Engine", "Engine", "Engine"] },
    state: "moving", sectorId: 0, position: { x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f },
    // Twenty units a second, as a ship at cruise.
    timer: Math.max(0.01, (length - along) / 20), cargo: 0, cargoMaterial: null, target: null, defaultBehaviour: "none", mineMaterials: [],
    order: null, leg: { from, to }, berth: null, transfer: null,
  };
};

// Positions rebuilt from the straight leg, as the tick does, then separated.
function sweep(frames: number, step: number, build: (along: number) => Ship[], modules: StationModule[] = []) {
  const frame: Ship[][] = [];
  for (let i = 0; i < frames; i += 1) frame.push(separateTraffic(build(i * step), [], modules, []).ships);
  return frame;
}

const jumps = (frames: Ship[][], index: number) => frames.slice(1).map((ships, i) => Math.hypot(
  ships[index]!.position.x - frames[i]![index]!.position.x, ships[index]!.position.y - frames[i]![index]!.position.y));

describe("smooth traffic separation", () => {
  it("two ships on an exact collision course slide past without swapping sides in one frame", () => {
    const step = 0.8;
    const frames = sweep(110, step, (along) => [
      ship(1, { x: -40, y: 0 }, { x: 40, y: 0 }, along),
      ship(2, { x: 40, y: 0 }, { x: -40, y: 0 }, along),
    ]);
    for (const index of [0, 1]) expect(Math.max(...jumps(frames, index))).toBeLessThan(step * 2);
    // Contact distance for two 1.5 by 1.5 ships is 2.12. They pass with at
    // most a few percent of overlap, and never on top of each other.
    for (const ships of frames) {
      const gap = Math.hypot(ships[0]!.position.x - ships[1]!.position.x, ships[0]!.position.y - ships[1]!.position.y);
      expect(gap).toBeGreaterThan(1.9);
    }
  });

  it("steers a leg through a module's centre around one side without hopping to the far edge", () => {
    const module: StationModule = { type: "Storage", position: { x: 0, y: 0 }, size: { width: 40, height: 20 } };
    const step = 0.8;
    const frames = sweep(150, step, (along) => [ship(1, { x: -60, y: 0 }, { x: 60, y: 0 }, along)], [module]);
    expect(Math.max(...jumps(frames, 0))).toBeLessThan(step * 2);
    const sides = new Set(frames.map(([s]) => Math.sign(Math.round(s!.position.y * 1000) / 1000)).filter((side) => side !== 0));
    expect(sides.size).toBe(1);
    for (const [s] of frames) {
      const inside = Math.abs(s!.position.x) < 20 + 0.75 - 1e-6 && Math.abs(s!.position.y) < 10 + 0.75 - 1e-6;
      expect(inside).toBe(false);
    }
  });

  it("steers a leg around a ship parked on its path instead of through it", () => {
    const parked: Ship = { ...ship(9, { x: 0, y: 0 }, { x: 1, y: 0 }, 0), state: "holding", leg: null, timer: 0 };
    const step = 0.8;
    const frames = sweep(110, step, (along) => [ship(1, { x: -40, y: 0 }, { x: 40, y: 0 }, along), parked]);
    expect(Math.max(...jumps(frames, 0))).toBeLessThan(step * 2);
    for (const [mover, still] of frames) {
      expect(still!.position).toEqual({ x: 0, y: 0 });
      expect(Math.hypot(mover!.position.x, mover!.position.y)).toBeGreaterThan(2);
    }
  });

  // Fine sampling: a 0.8 unit step steps over the moment two hulls overlap.
  const overlap = (a: Vec, b: Vec, size = 1.5) => Math.abs(a.x - b.x) < size - 1e-9 && Math.abs(a.y - b.y) < size - 1e-9;

  it("keeps a leg that ends just past a module clear of it while easing back", () => {
    const module: StationModule = { type: "Storage", position: { x: 0, y: 0 }, size: { width: 40, height: 20 } };
    const frames = sweep(851, 0.1, (along) => [ship(1, { x: -60, y: 0 }, { x: 25, y: 0 }, along)], [module]);
    for (const [s] of frames) {
      const { x, y } = s!.position;
      expect(Math.abs(x) < 20 + 0.75 - 1e-6 && Math.abs(y) < 10 + 0.75 - 1e-6).toBe(false);
    }
    // And it still lands exactly on the destination.
    expect(frames[frames.length - 1]![0]!.position.x).toBeCloseTo(25, 6);
    expect(frames[frames.length - 1]![0]!.position.y).toBeCloseTo(0, 6);
  });

  // Two ships in otherwise empty space never overlap hulls, whatever the angle
  // or timing of the pass, and still move smoothly at the frame step.
  it.each([
    ["head-on", 0, 0], ["head-on, one ship 2 units late", 0, 2], ["head-on, one ship 5 units late", 0, 5],
    ["crossing at 15 degrees", 15, 0], ["crossing at 15 degrees, 3 units late", 15, 3], ["crossing at 45 degrees", 45, 0],
    ["crossing at 90 degrees", 90, 0],
  ])("keeps two isolated ships clear when %s", (_name, degrees, late) => {
    const turn = degrees * Math.PI / 180;
    const dir = { x: Math.cos(turn), y: Math.sin(turn) };
    const build = (along: number) => [
      ship(1, { x: -40, y: 0 }, { x: 40, y: 0 }, along),
      ship(2, { x: -40 * dir.x + late * dir.x, y: -40 * dir.y + late * dir.y }, { x: 40 * dir.x + late * dir.x, y: 40 * dir.y + late * dir.y }, along),
    ];
    // Head-on legs run opposite ways, so mirror the second leg.
    const flip = degrees === 0 && late >= 0;
    const mirrored = (along: number) => flip ? [
      ship(1, { x: -40, y: 0 }, { x: 40, y: 0 }, along),
      ship(2, { x: 40 - late, y: 0 }, { x: -40 - late, y: 0 }, along),
    ] : build(along);
    const fine = sweep(801, 0.1, mirrored);
    for (const [a, b] of fine) expect(overlap(a!.position, b!.position)).toBe(false);
    const coarse = sweep(110, 0.8, mirrored);
    for (const index of [0, 1]) expect(Math.max(...jumps(coarse, index))).toBeLessThan(1.6);
  });

  // The same scan a reviewer ran: no body may hop more than 1.7 units a frame
  // (ordinary flight is 0.5 to 0.8) while its leg is unchanged.
  // The one allowed exception is the few frames after a neighbour within reach
  // starts a new leg. Its new direction changes which way the pair slides past each
  // other (as does one that stops), and that is an event, not the flicker of a
  // crowd reshuffling.
  it.each([
    ["createInitialState(3)", () => createInitialState(3)],
    ["createInitialState(7)", () => createInitialState(7)],
    ["miningStart(7)", () => miningStart(7)],
  ])("moves every ship and bug smoothly over a long run from %s", (_name, start) => {
    let state: SimState = start();
    type Seen = { x: number; y: number; leg: string; state: string };
    let previous = new Map<string, Seen>();
    // The last frame each body started a new leg or stopped.
    const changedAt = new Map<string, number>();
    let worst = 0;
    let bad = 0;
    for (let i = 0; i < 9000; i += 1) {
      state = tick(state, 1 / 30);
      const bodies = [
        ...state.ships.map((body) => ({ key: `s${body.id}`, body, sector: body.sectorId })),
        ...(state.bugs as Bug[]).map((body) => ({ key: `b${body.id}`, body, sector: body.sectorId })),
      ];
      const now = new Map<string, Seen>();
      const fresh = new Set<string>();
      for (const { key, body } of bodies) {
        const leg = (body.leg ? `${body.leg.from.x},${body.leg.from.y},${body.leg.to.x},${body.leg.to.y}` : "") + (body.timer > 0 ? "" : "|stopped");
        now.set(key, { x: body.position.x, y: body.position.y, leg, state: body.state });
        const before = previous.get(key);
        if (!before || before.leg !== leg || before.state !== body.state) { fresh.add(key); changedAt.set(key, i); }
      }
      for (const { key, body, sector } of bodies) {
        const before = previous.get(key);
        if (!before || fresh.has(key) || !body.leg) continue;
        const step = Math.hypot(body.position.x - before.x, body.position.y - before.y);
        const neighbourChanged = bodies.some((other) => other.key !== key && i - (changedAt.get(other.key) ?? -99) <= 3 && other.sector === sector
          && Math.hypot(other.body.position.x - body.position.x, other.body.position.y - body.position.y) < 9);
        if (neighbourChanged) continue;
        worst = Math.max(worst, step);
        if (step > 1.7) bad += 1;
      }
      previous = now;
    }
    expect({ bad, worst: Math.round(worst * 10) / 10 }).toEqual({ bad: 0, worst: expect.any(Number) });
    expect(worst).toBeLessThan(1.7);
  }, 60000);
});
