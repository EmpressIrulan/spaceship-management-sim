import { describe, expect, it } from "vitest";
import { miningStart } from "./test-ships";
import { HOME_SECTOR, JUMP_SECONDS, sectorInGateRange, startGateBuild } from "./state";
import { tick } from "./tick";
import { giveOrder } from "./orders";

describe("two linked sectors", () => {
  it("creates two reproducibly named sectors with paired gates and rocks", () => {
    const a = miningStart(11);
    const b = miningStart(11);
    expect(a.sectors).toHaveLength(4);
    expect(a.sectors.map((s) => s.name)).toEqual(b.sectors.map((s) => s.name));
    expect(a.sectors[0]!.name).not.toBe(a.sectors[1]!.name);
    expect(a.sectors.map((s) => s.gate.to)).toEqual([1, 0, 2, 3]);
    expect(new Set(a.asteroids.map((rock) => rock.sectorId))).toEqual(new Set([0, 1, 2, 3]));
    for (const sector of a.sectors) {
      expect(new Set(a.asteroids.filter((rock) => rock.sectorId === sector.id).map((rock) => rock.material)))
        .toEqual(new Set(["Metal", "Ice"]));
    }
    expect(a.stations[0]!.sectorId).toBe(HOME_SECTOR);
  });

  it("places paired incomplete gate ends at player-picked positions", () => {
    const start = miningStart(11);
    const built = startGateBuild(start, HOME_SECTOR, { x: 90, y: 40 }, 3, { x: -70, y: 120 });
    expect(built.gateProjects).toEqual([{
      id: 0,
      ends: [{ sectorId: 0, position: { x: 90, y: 40 } }, { sectorId: 3, position: { x: -70, y: 120 } }],
      delivered: { Metal: 0, Ice: 0 },
      complete: false,
    }]);
  });

  it("only starts an in-range project with one end at Home", () => {
    const start = miningStart(11);
    expect(startGateBuild(start, 1, { x: 0, y: 0 }, 3, { x: 0, y: 0 })).toBe(start);
    expect(startGateBuild(start, HOME_SECTOR, { x: 0, y: 0 }, 2, { x: 0, y: 0 })).toBe(start);
    expect(sectorInGateRange(HOME_SECTOR, 1)).toBe(true);
    expect(sectorInGateRange(HOME_SECTOR, 2)).toBe(false);
  });

  it("sends an ID-selected ship through gates to mine a distant-sector rock", () => {
    const start = miningStart(11);
    const rock = start.asteroids.find((item) => item.sectorId !== HOME_SECTOR)!;
    const state = giveOrder(start, [start.ships[0]!.id], { kind: "mine", asteroidId: rock.id });
    expect(state.ships[0]!.target?.sectorId).toBe(rock.sectorId);
    expect(state.sectors).toHaveLength(4);
    expect(JUMP_SECONDS).toBe(2);
    const jumped = tick(state, 1);
    expect(jumped.ships[0]!.state).toBe("outbound");
    expect(jumped.ships[0]!.leg?.to).toEqual(start.sectors[0]!.gate.position);
  });

  it("jumps out, mines, returns through the gate, and unloads at home", () => {
    let state = miningStart(19);
    const rock = state.asteroids.find((item) => item.sectorId === 1)!;
    state = giveOrder(state, [state.ships[0]!.id], { kind: "mine", asteroidId: rock.id });
    const until = (done: (s: typeof state) => boolean, limit = 1000) => {
      for (let time = 0; time < limit; time += 1 / 30) {
        if (done(state)) return;
        state = tick(state, 1 / 30);
      }
      throw new Error("condition not reached");
    };
    until((s) => s.ships[0]!.state === "jumpingOut");
    expect(state.ships[0]!.position).toEqual(state.sectors[0]!.gate.position);
    state = tick(state, JUMP_SECONDS);
    expect(state.ships[0]!.sectorId).toBe(1);
    until((s) => s.ships[0]!.state === "working");
    until((s) => s.ships[0]!.state === "jumpingHome");
    state = tick(state, JUMP_SECONDS);
    expect(state.ships[0]!.sectorId).toBe(0);
    until((s) => s.stations[0]!.inventory[rock.material] > 20);
    until((s) => s.ships[0]!.state === "outbound");
    expect(state.ships[0]!.target?.sectorId).toBe(0);
  });
});
