import { describe, expect, it } from "vitest";
import { createInitialState, type Ship } from "sim";
import { repairBeam } from "./repair-beam";

describe("repair beam", () => {
  it("connects a repairing ship to its damaged ship target", () => {
    const state = createInitialState(7);
    const base = state.ships[0]!;
    const repairer = { ...base, id: 10, position: { x: 4, y: 8 }, design: { width: 1, height: 1, slots: ["Repair"] } } as Ship;
    const target = { ...base, id: 11, position: { x: 30, y: 20 }, hp: 12, maxHp: 40 } as Ship;
    repairer.repairTarget = { kind: "ship", shipId: target.id };

    expect(repairBeam({ ...state, ships: [repairer, target] }, repairer)).toEqual({ from: repairer.position, to: target.position });
  });

  it("has no beam when the target is already full", () => {
    const state = createInitialState(7);
    const repairer = { ...state.ships[0]!, id: 10, design: { width: 1, height: 1, slots: ["Repair"] } } as Ship;
    const target = { ...state.ships[0]!, id: 11, hp: 40, maxHp: 40 } as Ship;
    repairer.repairTarget = { kind: "ship", shipId: target.id };
    expect(repairBeam({ ...state, ships: [repairer, target] }, repairer)).toBeNull();
  });
});
