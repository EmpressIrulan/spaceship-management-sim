import { describe, expect, it } from "vitest";
import { miningStart } from "./test-ships";
import { tick } from "./tick";
import { giveOrder } from "./orders";
import { inRepairRange } from "./shields";
import type { ShipDesign, SimState } from "./model";

const design: ShipDesign = { width: 5, height: 1, slots: ["Engine", "Repair", "Repair", "Repair", "Repair"] };
function setup(): SimState {
  const state = miningStart(7);
  const target = { ...state.ships[0]!, id: 11, state: "holding" as const, defaultBehaviour: "none" as const,
    order: null, leg: null, timer: 0, berth: null, target: null, position: { x: 300, y: 0 }, hp: 10, maxHp: 40 };
  const repairer = { ...target, id: 10, design, position: { x: 0, y: 0 }, hp: 40 };
  return { ...state, hives: [], bugs: [], ships: [repairer, target] };
}
function advance(state: SimState, seconds: number): SimState {
  for (let i = 0; i < seconds * 60; i++) state = tick(state, 1 / 60);
  return state;
}

describe("repair orders at 60 fps", () => {
  it.each(["explicit", "default"])("reaches a distant %s repair target and heals it", (mode) => {
    let state = setup();
    if (mode === "explicit") state = giveOrder(state, [10], { kind: "repair", target: { kind: "ship", shipId: 11 } });
    else state.ships[0]!.defaultBehaviour = "repair";
    state = advance(state, 40);
    expect(inRepairRange(state.ships[0]!, state.ships[1]!)).toBe(true);
    expect(state.ships[1]!.hp).toBeGreaterThan(10);
  });

  it("reaches and repairs a distant station module at 60 fps", () => {
    let state = setup();
    state.ships = [state.ships[0]!];
    const station = state.stations[0]!;
    station.modules = [{type: "Builder",position: {x: 300,y: 0},size: {width: 2,height: 2},hp: 10,maxHp: 40}];
    state.ships[0]!.defaultBehaviour = "repair";
    state = advance(state,40);
    expect(state.stations[0]!.modules[0]!.hp).toBeGreaterThan(10);
  });

  it.each(["explicit", "default"])("obeys a move order replacing %s repair without drifting back", (mode) => {
    let state = setup();
    if (mode === "explicit") state = giveOrder(state, [10], { kind: "repair", target: { kind: "ship", shipId: 11 } });
    else state.ships[0]!.defaultBehaviour = "repair";
    state = advance(state, 1);
    state = giveOrder(state, [10], { kind: "move", point: { x: 0, y: 300 } });
    expect(state.ships[0]!.repairTarget ?? null).toBeNull();
    expect(state.ships[0]!.repairTargetShipId ?? null).toBeNull();
    state = advance(state, 40);
    expect(state.ships[0]!.position).toEqual({ x: 0, y: 300 });
    expect(state.ships[0]!.order?.kind).toBe("move");
    expect(state.ships[1]!.hp).toBe(10);
  });
});
