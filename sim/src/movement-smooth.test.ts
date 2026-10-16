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

  // Separation eases a body aside over several frames: on top of its own cruise
  // step it may add at most half a cruise step, whatever its neighbours do.
  it.each([
    ["createInitialState(3)", () => createInitialState(3)],
    ["createInitialState(7)", () => createInitialState(7)],
    ["miningStart(7)", () => miningStart(7)],
  ])("never adds more than half a cruise step of separation in a frame from %s", (_name, start) => {
    const dt = 1 / 30;
    let state: SimState = start();
    const previous = new Map<string, { x: number; y: number; leg: string; state: string }>();
    let worstRatio = 0;
    let bad = 0;
    for (let i = 0; i < 9000; i += 1) {
      state = tick(state, dt);
      const bodies = [
        ...state.ships.map((body) => ({ key: `s${body.id}`, body, cruise: 25 })),
        ...(state.bugs as Bug[]).map((body) => ({ key: `b${body.id}`, body, cruise: 15 })),
      ];
      for (const { key, body, cruise } of bodies) {
        const leg = body.leg ? `${body.leg.from.x},${body.leg.from.y},${body.leg.to.x},${body.leg.to.y}` : "";
        const before = previous.get(key);
        previous.set(key, { x: body.position.x, y: body.position.y, leg, state: body.state });
        if (!before || !leg || before.leg !== leg || before.state !== body.state) continue;
        const step = Math.hypot(body.position.x - before.x, body.position.y - before.y);
        worstRatio = Math.max(worstRatio, step / (cruise * dt));
        if (step > cruise * dt * 1.5 + 1e-6) bad += 1;
      }
    }
    expect({ bad, worstRatio: Math.round(worstRatio * 100) / 100 }).toEqual({ bad: 0, worstRatio: expect.any(Number) });
  }, 60000);

  // The same passes with separation limited to half a cruise step a frame, the
  // way the tick applies it: each frame starts from where the last one showed
  // the ship. Clearance must survive being eased in.
  it.each([
    ["head-on", 0], ["crossing at 15 degrees", 15], ["crossing at 45 degrees", 45], ["crossing at 90 degrees", 90],
  ])("keeps two isolated ships clear while easing aside, %s", (_name, degrees) => {
    const turn = degrees * Math.PI / 180;
    const dir = { x: Math.cos(turn), y: Math.sin(turn) };
    const head = degrees === 0;
    const build = (along: number) => [
      ship(1, { x: -40, y: 0 }, { x: 40, y: 0 }, along),
      head ? ship(2, { x: 40, y: 0 }, { x: -40, y: 0 }, along)
        : ship(2, { x: -40 * dir.x, y: -40 * dir.y }, { x: 40 * dir.x, y: 40 * dir.y }, along),
    ];
    // 0.1 unit steps at 20 units a second.
    const seconds = 0.1 / 20;
    let nudges: Vec[] = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
    let worstOverlap = 0;
    for (let i = 0; i < 801; i += 1) {
      const raw = build(i * 0.1).map((s, index) => ({ ...s, nudgeX: nudges[index]!.x, nudgeY: nudges[index]!.y }));
      const out = separateTraffic(raw, [], [], [], seconds).ships;
      nudges = out.map((s) => ({ x: s.nudgeX ?? 0, y: s.nudgeY ?? 0 }));
      const a = out[0]!.position; const b = out[1]!.position;
      if (overlap(a, b)) worstOverlap = Math.max(worstOverlap, 1.5 - Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)));
    }
    expect(worstOverlap).toBe(0);
  });

  it("keeps module clearance while separation is being eased", () => {
    const module: StationModule = { type: "Storage", position: { x: 0, y: 0 }, size: { width: 40, height: 20 } };
    const seconds = 0.1 / 20;
    let nudge = { x: 0, y: 0 };
    for (let i = 0; i < 851; i += 1) {
      const raw = ship(1, { x: -60, y: 0 }, { x: 25, y: 0 }, i * 0.1);
      const out = separateTraffic([{ ...raw, nudgeX: nudge.x, nudgeY: nudge.y }], [], [module], [], seconds).ships[0]!;
      nudge = { x: out.nudgeX ?? 0, y: out.nudgeY ?? 0 };
      const { x, y } = out.position;
      expect(Math.abs(x) < 20 + 0.75 - 1e-6 && Math.abs(y) < 10 + 0.75 - 1e-6).toBe(false);
    }
  });
});
