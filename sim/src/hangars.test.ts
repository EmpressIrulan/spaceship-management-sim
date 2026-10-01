import { describe, expect, it } from "vitest";
import {
  createInitialState,
  giveDockOrder,
  giveOrder,
  hangarCapacity,
  hangarContents,
  launchAll,
  pixelCount,
  tick,
  type Ship,
  type ShipDesign,
} from "./index";

const CARRIER: ShipDesign = {
  width: 41,
  height: 1,
  slots: ["Engine", ...Array<ShipDesign["slots"][number]>(40).fill("Hangar")],
};

const FIGHTER: ShipDesign = {
  width: 2,
  height: 2,
  slots: ["Engine", "Storage", "Laser", "Hull"],
};

function fleet(count = 11) {
  const initial = createInitialState(1);
  const template = initial.ships[0]!;
  const carrier: Ship = {
    ...template,
    id: 1,
    design: CARRIER,
    defaultBehaviour: "none",
    state: "holding",
    position: { x: 100, y: 0 },
  };
  const fighters = Array.from({ length: count }, (_, index): Ship => ({
    ...template,
    id: index + 2,
    design: FIGHTER,
    defaultBehaviour: "none",
    state: "holding",
    position: { x: index * 4, y: 0 },
  }));
  return { ...initial, nextShipId: count + 2, ships: [carrier, ...fighters] };
}

describe("carrier hangars", () => {
  it("holds ships up to the number of Hangar pixels", () => {
    let state = fleet();
    expect(hangarCapacity(state.ships[0]!.design)).toBe(40);

    state = giveDockOrder(state, state.ships.slice(1).map((ship) => ship.id), 1);

    expect(state.ships.filter((ship) => ship.order?.kind === "dock")).toHaveLength(10);
    expect(state.ships.at(-1)!.state).toBe("holding");
    state = tick(state, 100);
    expect(hangarContents(state, 1)).toHaveLength(10);
    expect(hangarContents(state, 1).reduce((sum, ship) => sum + pixelCount(ship.design), 0)).toBe(40);
  });

  it("carries docked ships with the carrier and launches all beside it", () => {
    let state = fleet(1);
    state = { ...state, ships: state.ships.map((ship) => ship.id === 2
      ? { ...ship, defaultBehaviour: "mine", mineMaterials: ["Metal", "Ice"] }
      : ship) };
    state = tick(giveDockOrder(state, [2], 1), 100);
    state = tick(giveOrder(state, [1], { kind: "move", point: { x: 240, y: 80 } }), 100);

    const carrier = state.ships.find((ship) => ship.id === 1)!;
    const docked = state.ships.find((ship) => ship.id === 2)!;
    expect(docked.hangarId).toBe(carrier.id);
    expect(docked.position).toEqual(carrier.position);
    expect(docked.sectorId).toBe(carrier.sectorId);

    state = launchAll(state, carrier.id);
    const launched = state.ships.find((ship) => ship.id === 2)!;
    expect(launched.hangarId).toBeNull();
    expect(launched.state).toBe("outbound");
    expect(launched.target).not.toBeNull();
    expect(launched.position).not.toEqual(carrier.position);
  });
});
