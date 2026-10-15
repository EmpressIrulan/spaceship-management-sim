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
    timer: 10, cargo: 0, cargoMaterial: null, target: null, defaultBehaviour: "none", mineMaterials: [],
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

  // The same scan a reviewer ran: no body may hop more than a body length
  // while its leg is unchanged.
  it.each([
    ["createInitialState(3)", () => createInitialState(3)],
    ["createInitialState(7)", () => createInitialState(7)],
    ["miningStart(7)", () => miningStart(7)],
  ])("moves every ship and bug smoothly over a long run from %s", (_name, start) => {
    let state: SimState = start();
    const previous = new Map<string, { x: number; y: number; leg: string; state: string }>();
    const seen = (key: string, body: { position: Vec; leg: { from: Vec; to: Vec } | null; state: string }) => {
      const leg = body.leg ? `${body.leg.from.x},${body.leg.from.y},${body.leg.to.x},${body.leg.to.y}` : "";
      const before = previous.get(key);
      previous.set(key, { x: body.position.x, y: body.position.y, leg, state: body.state });
      if (!before || !leg || before.leg !== leg || before.state !== body.state) return 0;
      return Math.hypot(body.position.x - before.x, body.position.y - before.y);
    };
    let worst = 0;
    let bad = 0;
    for (let i = 0; i < 9000; i += 1) {
      state = tick(state, 1 / 30);
      for (const s of state.ships) { const d = seen(`s${s.id}`, s); worst = Math.max(worst, d); if (d > 1.5) bad += 1; }
      for (const b of state.bugs as Bug[]) { const d = seen(`b${b.id}`, b); worst = Math.max(worst, d); if (d > 1.5) bad += 1; }
    }
    expect({ bad, worst: Math.round(worst * 10) / 10 }).toEqual({ bad: 0, worst: expect.any(Number) });
    expect(worst).toBeLessThan(1.5);
  }, 60000);
});
