import { describe, expect, it } from "vitest";
import { createInitialState, startGateBuild } from "sim";
import { fitCamera, hoveredBody, worldToScreen } from "./camera";
import { contextOrderAllowed, orderLineAlpha, orderTargetAt, selectionPanel, shipsInBox, toggleShip } from "./selection";

describe("RTS selection helpers", () => {
  it("box-selects by ship id and shift selection toggles by id", () => {
    const state = createInitialState(7);
    const camera = fitCamera({ width: 800, height: 600 }, [state.station.dock, ...state.asteroids]);
    const viewport = { width: 800, height: 600 };
    const twoShips = { ...state, ships: [state.ships[0]!, { ...state.ships[0]!, id: 42 }] };
    const box = { x: 0, y: 0 };
    const picked = shipsInBox(twoShips, camera, viewport, 0, box, { x: 800, y: 600 });
    expect(picked).toEqual([0, 42]);
    expect(toggleShip(picked, 0)).toEqual([42]);
    expect(toggleShip([], 0)).toEqual([0]);
  });

  it("lists selected ships, mixed defaults, and whether Resume is available", () => {
    const initial = createInitialState(7);
    const second = { ...initial.ships[0]!, id: 14, defaultBehaviour: "none" as const, order: { kind: "move" as const, point: { x: 1, y: 2 }, sectorId: 0 } };
    const state = { ...initial, ships: [initial.ships[0]!, second] };
    expect(selectionPanel(state, [0, 14])).toMatchObject({ defaultBehaviour: "mixed", canResume: true, rows: [{ id: 0 }, { id: 14 }] });
  });

  it("marks an order that is holding", () => {
    const initial = createInitialState(7);
    const ship = { ...initial.ships[0]!, state: "holding" as const,
      order: { kind: "move" as const, point: { x: 1, y: 2 }, sectorId: 0 } };
    const state = { ...initial, ships: [ship] };

    expect(selectionPanel(state, [0])?.rows[0]?.status).toBe("Order: move (holding)");
  });

  it("disables Haul with one station and names the route controls with two", () => {
    const initial = createInitialState(7);
    expect(selectionPanel(initial, [0])).toMatchObject({
      canHaul: false,
      haulDisabledReason: "Needs two stations",
      haulRoute: null,
    });

    const state = {
      ...initial,
      sectors: initial.sectors.map((sector, index) => ({ ...sector, name: index === 0 ? "Home" : index === 1 ? "Kessel" : sector.name })),
      claimSites: [{ id: 3, sectorId: 1, position: { x: 100, y: 50 }, stage: 2, delivered: { Metal: 0, Ice: 0 }, timer: null }],
      ships: [{ ...initial.ships[0]!, defaultBehaviour: "haul" as const,
        haulRoute: { from: "home" as const, to: "claim:3" as const, material: "Ice" as const } }],
    };
    expect(selectionPanel(state, [0])).toMatchObject({
      canHaul: true,
      stations: [{ id: "home", name: "Home" }, { id: "claim:3", name: "Kessel" }],
      haulRoute: { from: "home", to: "claim:3", material: "Ice" },
    });
  });

  it("fades order feedback to zero after one second", () => {
    expect(orderLineAlpha(0)).toBe(1);
    expect(orderLineAlpha(0.5)).toBe(0.5);
    expect(orderLineAlpha(1)).toBe(0);
  });

  it("box-selects only ships in the sector being viewed", () => {
    const initial = createInitialState(19);
    const homeShip = initial.ships[0]!;
    const farShip = { ...homeShip, id: 42, sectorId: 1, position: { x: 2000, y: 2000 } };
    const state = { ...initial, ships: [homeShip, farShip] };
    const camera = { center: { x: 1000, y: 1000 }, zoom: 0.1 };

    expect(shipsInBox(state, camera, { width: 800, height: 600 }, 1, { x: 0, y: 0 }, { x: 800, y: 600 })).toEqual([42]);
  });

  it("ignores context orders while the map is open", () => {
    expect(contextOrderAllowed(true)).toBe(false);
    expect(contextOrderAllowed(false)).toBe(true);
  });

  it("hauls to an unfinished gate but moves onto a completed gate", () => {
    const building = startGateBuild(createInitialState(7), 0, { x: 80, y: 0 }, 3, { x: -80, y: 0 });
    const hovered = { kind: "gateProject" as const, id: 0 };
    expect(orderTargetAt(building, hovered, { x: 80, y: 0 }, 0)).toEqual({ kind: "haulGate", gateId: 0 });
    const complete = { ...building, gateProjects: [{ ...building.gateProjects[0]!, complete: true }] };
    expect(orderTargetAt(complete, hovered, { x: 80, y: 0 }, 0)).toEqual({ kind: "move", point: { x: 80, y: 0 }, sectorId: 0 });
  });

  it("orders home when the Dock is overlapped by a ship", () => {
    const state = createInitialState(7);
    const viewport = { width: 800, height: 600 };
    const camera = { center: { x: 0, y: 0 }, zoom: 1 };
    const pointer = worldToScreen(camera, viewport, state.station.dock.position);
    const hovered = hoveredBody(state, camera, viewport, pointer, 0, { includeShips: false });

    expect(orderTargetAt(state, hovered, state.station.dock.position)).toEqual({ kind: "home" });
  });

  it("orders a haul to a gate end overlapped by a ship", () => {
    const initial = createInitialState(7);
    const state = startGateBuild(initial, 0, { x: 80, y: 0 }, 3, { x: -80, y: 0 });
    const gateEnd = state.gateProjects[0]!.ends[0]!;
    state.ships[0] = { ...state.ships[0]!, state: "gateHauling", position: { ...gateEnd.position } };
    const viewport = { width: 800, height: 600 };
    const camera = { center: { x: 0, y: 0 }, zoom: 1 };
    const pointer = worldToScreen(camera, viewport, gateEnd.position);
    const hovered = hoveredBody(state, camera, viewport, pointer, gateEnd.sectorId, { includeShips: false });

    expect(orderTargetAt(state, hovered, gateEnd.position, gateEnd.sectorId)).toEqual({ kind: "haulGate", gateId: 0 });
  });
});
