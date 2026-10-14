import { describe, expect, it } from "vitest";
import { SHIELD_RECHARGE_DELAY, SHIELD_RECHARGE_PER_PIXEL } from "./build-constants";
import { advanceShipRepairs, damageShip, inRepairRange } from "./shields";
import { miningStart } from "./test-ships";
import { tick } from "./tick";
import { giveOrder } from "./orders";
import type { ShipDesign } from "./model";

const SHIP: ShipDesign = { width: 3, height: 1, slots: ["Capacitor", "Generator", "Hull"] };

function ship() {
  return { ...miningStart(7).ships[0]!, design: SHIP, shield: 20, maxShield: 20, hp: 40, maxHp: 40 };
}

describe("ship shield damage", () => {
  it("heals a nearby target at the configured rate but never heals itself", () => {
    const repairShip = { ...ship(), id: 1, position: { x: 0, y: 0 }, repairTargetShipId: 2,
      design: { width: 4, height: 1, slots: ["Repair", "Repair", "Repair", "Repair"] as ShipDesign["slots"] } };
    const target = { ...ship(), id: 2, position: { x: 1, y: 0 }, hp: 30 };
    const [repaired, healed] = advanceShipRepairs([repairShip, target], 1);
    expect(repaired!.hp).toBe(40);
    expect(healed!.hp).toBe(30.8);
  });

  it("lets two repair ships heal one another", () => {
    const design = { width: 1, height: 1, slots: ["Repair"] as ShipDesign["slots"] };
    const first = { ...ship(), id: 1, design, repairTargetShipId: 2, hp: 30, position: { x: 0, y: 0 } };
    const second = { ...ship(), id: 2, design, repairTargetShipId: 1, hp: 30, position: { x: 1, y: 0 } };
    expect(advanceShipRepairs([first, second], 1).map((candidate) => candidate!.hp)).toEqual([30.2, 30.2]);
  });

  it("moves to a set repair target, then heals it while parked beside it", () => {
    const state = miningStart(7);
    const design = { width: 5, height: 1, slots: ["Engine", "Repair", "Repair", "Repair", "Repair"] as ShipDesign["slots"] };
    const target = { ...state.ships[0]!, id: 10, state: "holding" as const, position: { x: 1000, y: 1000 }, hp: 30, maxHp: 40 };
    const repairer = { ...target, id: 11, design, position: { x: 0, y: 0 }, hp: 40, repairTargetShipId: 10 };
    const started = tick({ ...state, hives: [], bugs: [], ships: [repairer, target] }, 1);
    const moved = tick(started, 10000);
    expect(moved.ships[0]!.position).not.toEqual(repairer.position);
    expect(inRepairRange(moved.ships[0]!, moved.ships[1]!)).toBe(true);
    expect(moved.ships[1]!.hp).toBeGreaterThan(30);
    expect(moved.ships[0]!.hp).toBe(40);
  });

  it("repairs a damaged station module after selecting the nearest target by default", () => {
    const state = miningStart(7);
    const repairer = { ...state.ships[0]!, id: 11, defaultBehaviour: "repair" as const,
      design: { width: 1, height: 1, slots: ["Repair"] as ShipDesign["slots"] },
      state: "holding" as const, position: { x: 1, y: 0 }, timer: 0, order: null, leg: null };
    const station = { ...state.stations[0]!, modules: state.stations[0]!.modules.map((module, index) => index === 0
      ? { ...module, hp: 20, maxHp: 40 } : module) };
    const started = tick({ ...state, ships: [repairer], stations: [station], hives: [], bugs: [] }, 0);
    const healed = tick(started, 1);
    expect(started.ships[0]!.repairTarget).toEqual({ kind: "module", stationId: station.id, position: station.modules[0]!.position });
    expect(healed.stations[0]!.modules[0]!.hp).toBeGreaterThan(20);
  });

  it("accepts a one-off module repair assignment for a Repair ship", () => {
    const base = miningStart(7);
    const repairer = { ...base.ships[0]!, design: { width: 1, height: 1, slots: ["Repair"] as ShipDesign["slots"] }, state: "holding" as const };
    const module = base.stations[0]!.modules[0]!;
    const station = { ...base.stations[0]!, modules: base.stations[0]!.modules.map((item, index) => index === 0 ? { ...item, hp: 20, maxHp: 40 } : item) };
    const state = { ...base, ships: [repairer], stations: [station] };
    const ordered = giveOrder(state, [repairer.id], { kind: "repair", target: { kind: "module", stationId: station.id, position: module.position } });
    expect(ordered.ships[0]).toMatchObject({ order: { kind: "repair" }, repairTarget: { kind: "module", stationId: station.id } });
    expect(tick(ordered, 1).stations[0]!.modules[0]!.hp).toBeGreaterThan(20);
  });

  it("returns from a one-off ship repair to the ship's default when the target is full", () => {
    const state = miningStart(7);
    const design = { width: 1, height: 1, slots: ["Repair"] as ShipDesign["slots"] };
    const repairTarget = { kind: "ship" as const, shipId: 2 };
    const repairer = { ...state.ships[0]!, id: 1, design, defaultBehaviour: "mine" as const,
      state: "holding" as const, position: { x: 0, y: 0 }, order: { kind: "repair" as const, target: repairTarget }, repairTarget };
    const target = { ...state.ships[0]!, id: 2, state: "holding" as const, position: { x: 1, y: 0 }, hp: 39.9, maxHp: 40 };
    const result = tick({ ...state, hives: [], bugs: [], ships: [repairer, target] }, 1);
    expect(result.ships[1]!.hp).toBe(40);
    expect(result.ships[0]).toMatchObject({ defaultBehaviour: "mine", order: null, repairTarget: null });
  });

  it("soaks a hit before hull and carries leftover damage into hull", () => {
    const damaged = damageShip({ ...ship(), shield: 5 }, 8, 12);
    expect(damaged).toMatchObject({ shield: 0, hp: 37, shieldLastHit: 12 });
  });

  it("records the last hit even when a Capacitor's shield is already empty", () => {
    const damaged = damageShip({ ...ship(), shield: 0, shieldLastHit: undefined }, 3, 12);
    expect(damaged).toMatchObject({ shield: 0, hp: 37, shieldLastHit: 12 });
  });

  it("does not start a shield delay without a Capacitor", () => {
    const damaged = damageShip({ ...ship(), design: { width: 2, height: 1, slots: ["Generator", "Hull"] }, shield: 0, maxShield: 0 }, 3, 12);
    expect(damaged).toMatchObject({ shield: 0, hp: 37 });
    expect(damaged?.shieldLastHit).toBeUndefined();
  });
});

describe("ship shield recharge", () => {
  it("waits five seconds after a hit, then refills at the generator rate", () => {
    let state = miningStart(7);
    const shielded = { ...state.ships[0]!, design: SHIP, state: "holding" as const, timer: 0,
      shield: 0, maxShield: 20, shieldLastHit: 0 };
    state = { ...state, ships: [shielded] };
    state = tick(state, SHIELD_RECHARGE_DELAY - 0.1);
    expect(state.ships[0]!.shield).toBe(0);
    state = tick(state, 0.1);
    expect(state.ships[0]!.shield).toBe(0);
    state = tick(state, 2);
    expect(state.ships[0]!.shield).toBe(2 * SHIELD_RECHARGE_PER_PIXEL);
    state = tick(state, 18);
    expect(state.ships[0]!.shield).toBe(20);
  });

  it("restarts the delay when a hit lands during recharge", () => {
    let state = miningStart(7);
    const shielded = { ...state.ships[0]!, design: SHIP, state: "holding" as const, timer: 0,
      shield: 0, maxShield: 20, shieldLastHit: 0 };
    state = { ...state, ships: [shielded] };
    state = tick(state, SHIELD_RECHARGE_DELAY + 1);
    const hit = damageShip(state.ships[0]!, 2, state.time);
    expect(hit).toMatchObject({ shield: 0, hp: 39, shieldLastHit: state.time });
    state = { ...state, ships: hit ? [hit] : [] };
    state = tick(state, SHIELD_RECHARGE_DELAY - 0.1);
    expect(state.ships[0]!.shield).toBe(0);
  });

  it("waits five seconds from the latest hit on an empty shield", () => {
    let state = miningStart(7);
    state = { ...state, hives: [], ships: [{ ...ship(), state: "holding", timer: 0, shield: 0, shieldLastHit: 0 }] };
    state = tick(state, 4);
    state = { ...state, ships: [damageShip(state.ships[0]!, 1, state.time)!] };
    state = tick(state, 4);
    expect(state.ships[0]!).toMatchObject({ shield: 0, hp: 39, shieldLastHit: 4 });
    state = tick(state, 1);
    expect(state.ships[0]!.shield).toBe(0);
    state = tick(state, 1);
    expect(state.ships[0]!.shield).toBe(SHIELD_RECHARGE_PER_PIXEL);
  });
});
