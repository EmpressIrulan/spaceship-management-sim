import { describe, expect, it } from "vitest";
import { DOCK_CAPACITY, DOCK_SIZE, MATERIALS, createInitialState, dockBerths, shipSize, tick, type Ship, type ShipDesign, type SimState, type Vec } from "./index";
import { suppliersComingHome } from "./test-ships";

const homeWithOre = { state: "homebound" as const, timer: 0, cargo: 20, cargoMaterial: "Metal" as const };

function fleetAtDock(count: number): SimState {
  const state = createInitialState(7);
  const base = state.ships[0]!;
  return {
    ...state,
    stations: [{ ...state.stations[0]!, storage: { ...state.stations[0]!.storage, capacity: 1000 } }],
    ships: Array.from({ length: count }, (_, id): Ship => ({
      ...base, ...homeWithOre, id, mineMaterials: [...MATERIALS], position: { ...state.stations[0]!.dock.position }, target: null, leg: null,
    })),
    nextShipId: count,
  };
}

const at = (ship: Ship): Vec => ship.position;
const apart = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

// Long enough for every ship to reach its pad or parking spot, and short
// enough that nobody has finished unloading.
const SETTLED = 8;

describe("Dock berths", () => {
  it("marks six pads on the Dock, clear of each other", () => {
    const state = createInitialState(7);
    const dock = state.stations[0]!.dock.position;
    const pads = dockBerths(dock);
    const width = shipSize(state.ships[0]!.design).width;

    expect(pads).toHaveLength(DOCK_CAPACITY);
    for (const pad of pads) {
      expect(Math.abs(pad.x - dock.x) + width / 2).toBeLessThan(DOCK_SIZE.width / 2);
      expect(Math.abs(pad.y - dock.y) + width / 2).toBeLessThan(DOCK_SIZE.height / 2);
    }
    for (let i = 0; i < pads.length; i += 1) {
      for (let j = i + 1; j < pads.length; j += 1) expect(apart(pads[i]!, pads[j]!)).toBeGreaterThan(width);
    }
  });

  it("fits small and large ships on distinct pads within the Dock module", () => {
    const state = fleetAtDock(2);
    const design = (side: number): ShipDesign => {
      const slots = Array<"Engine" | "Storage">(side * side).fill("Engine");
      slots[slots.length - 1] = "Storage";
      return { width: side, height: side, slots };
    };
    const mixed = {
      ...state,
      ships: state.ships.map((ship, index) => ({ ...ship, design: design(index === 0 ? 2 : 6) })),
    };
    const approaching = tick(mixed, 0);
    const docked = tick(approaching, Math.max(...approaching.ships.map((ship) => ship.timer)) + 0.01);
    const pads = dockBerths(docked.stations[0]!.dock.position);

    expect(docked.ships.map((ship) => ship.state)).toEqual(["unloading", "unloading"]);
    expect(docked.ships.map(at)).toEqual(pads.slice(0, 2));
    for (const pad of pads) {
      expect(Math.abs(pad.x - docked.stations[0]!.dock.position.x) + 6.5).toBeLessThanOrEqual(DOCK_SIZE.width * 0.47);
      expect(Math.abs(pad.y - docked.stations[0]!.dock.position.y) + 6.5).toBeLessThanOrEqual(DOCK_SIZE.height * 0.46);
    }
    const size = docked.ships.map((ship) => shipSize(ship.design));
    expect(Math.abs(at(docked.ships[0]!).x - at(docked.ships[1]!).x)).toBeGreaterThan((size[0]!.width + size[1]!.width) / 2);
    for (let ship = 0; ship < docked.ships.length; ship += 1) {
      for (let pad = 0; pad < pads.length; pad += 1) {
        if (pad === ship) continue;
        const dx = Math.abs(at(docked.ships[ship]!).x - pads[pad]!.x);
        const dy = Math.abs(at(docked.ships[ship]!).y - pads[pad]!.y);
        expect(dx > (size[ship]!.width + 13) / 2 || dy > (size[ship]!.height + 13) / 2).toBe(true);
      }
    }
  });

  it("puts each of six arriving ships on a pad of its own", () => {
    const state = tick(tick(fleetAtDock(6), 0), SETTLED);
    const pads = dockBerths(state.stations[0]!.dock.position);

    expect(state.ships.map((ship) => ship.state)).toEqual(Array(6).fill("unloading"));
    expect(state.ships.map(at)).toEqual(pads);
  });

  it("parks a seventh ship off the Dock, apart from the pads and the other waiting ships", () => {
    const state = tick(tick(fleetAtDock(9), 0), SETTLED);
    const dock = state.stations[0]!.dock.position;
    const pads = dockBerths(dock);
    const waiting = state.ships.filter((ship) => ship.state === "waiting");
    const width = shipSize(waiting[0]!.design).width;

    expect(waiting).toHaveLength(3);
    for (const ship of waiting) {
      for (const pad of pads) expect(apart(at(ship), pad)).toBeGreaterThan(width);
      expect(apart(at(ship), dock)).toBeLessThan(150);
    }
    for (let i = 0; i < waiting.length; i += 1) {
      for (let j = i + 1; j < waiting.length; j += 1) expect(apart(at(waiting[i]!), at(waiting[j]!))).toBeGreaterThan(width);
    }
  });

  it("keeps every pad free while three supply ships wait, so a miner can berth and unload", () => {
    const suppliers = suppliersComingHome(3);
    const miner = {
      ...suppliers.ships[0]!, id: 3, defaultBehaviour: "mine" as const, cargo: 20,
      cargoByMaterial: { Metal: 20, Ice: 0 }, mineMaterials: [...MATERIALS],
    };
    const flying = tick({ ...suppliers, ships: [...suppliers.ships, miner] }, 0);
    let settled = flying;
    for (let i = 0; i < 400 && !settled.ships.every((ship) => ship.state === "holding" || ship.state === "unloading"); i += 1) {
      settled = tick(settled, 0.5);
    }
    const dock = settled.stations[0]!.dock.position;
    const pads = dockBerths(dock);
    const waiting = settled.ships.filter((ship) => ship.state === "holding");

    // Waiting clear of the hull, so not one of them is standing on a pad.
    expect(waiting).toHaveLength(3);
    for (const ship of waiting) {
      expect(ship.berth).toBeNull();
      const onTheHull = Math.abs(at(ship).x - dock.x) <= DOCK_SIZE.width / 2
        && Math.abs(at(ship).y - dock.y) <= DOCK_SIZE.height / 2;
      expect(onTheHull).toBe(false);
    }
    // And the miner gets a pad of its own and unloads there.
    expect(at(settled.ships[3]!)).toEqual(pads[0]);
    expect(settled.ships[3]!).toMatchObject({ state: "unloading", berth: 0 });
    expect(settled.ships[3]!.cargo).toBeLessThan(20);
  });

  it("flies a waiting ship onto the pad that frees up", () => {
    const parked = tick(tick(fleetAtDock(7), 0), SETTLED);
    const first = parked.ships.filter((ship) => ship.state === "unloading").sort((a, b) => a.timer - b.timer)[0]!;

    const justFreed = tick(parked, first.timer);
    const flying = justFreed.ships.find((ship) => ship.id === 6)!;
    expect(flying.state).toBe("berthing");
    expect(flying.leg?.to).toEqual(first.position);

    const landed = tick(justFreed, flying.timer);
    expect(landed.ships.find((ship) => ship.id === 6)).toMatchObject({ state: "unloading", position: first.position });
  });

  it("lets a ship leave from its pad instead of jumping to the Dock first", () => {
    const parked = tick(tick(fleetAtDock(1), 0), SETTLED);
    const pads = dockBerths(parked.stations[0]!.dock.position);
    const left = tick(parked, parked.ships[0]!.timer);

    expect(left.ships[0]).toMatchObject({ state: "outbound", position: pads[0] });
    expect(left.ships[0]!.leg?.from).toEqual(pads[0]);
  });
});
