import { describe, expect, it } from "vitest";
import { createInitialState, queueModuleBuild, type Ship, type SimState } from "sim";
import { buildMenuItems } from "./building";
import { hoveredBody, bodyOf, worldToScreen, type Camera } from "./camera";
import { infoBox } from "./labels";
import { orderTargetAt, selectionPanel } from "./selection";
import { shipStatus } from "./ships";

const viewport = { width: 800, height: 600 };
const camera: Camera = { center: { x: 0, y: 0 }, zoom: 2 };

function withSite(inventory: SimState["station"]["constructionSite"]["inventory"]): SimState {
  const state = createInitialState(7);
  return { ...state, station: { ...state.station, constructionSite: { ...state.station.constructionSite, inventory } } };
}

function withShip(patch: Partial<Ship>): SimState {
  const state = createInitialState(7);
  return { ...state, ships: [{ ...state.ships[0]!, ...patch }] };
}

describe("the construction site on screen", () => {
  it("is absent and cannot be clicked with no queue, then returns with its contents", () => {
    const hidden = withSite({ Metal: 12, Ice: 0 });
    const pointer = worldToScreen(camera, viewport, hidden.station.constructionSite.position);
    expect(hoveredBody(hidden, camera, viewport, pointer)).not.toEqual({ kind: "constructionSite" });

    const queued = queueModuleBuild(hidden, "Storage", { x: 80, y: 0 });
    expect(hoveredBody(queued, camera, viewport, pointer)).toEqual({ kind: "constructionSite" });
    expect(queued.station.constructionSite.inventory).toEqual({ Metal: 12, Ice: 0 });
  });

  it("is hoverable while something is queued, and shows its uncapped inventory", () => {
    const state = queueModuleBuild(withSite({ Metal: 12, Ice: 0 }), "Storage", { x: 80, y: 0 });
    const { position } = state.station.constructionSite;
    const pointer = worldToScreen(camera, viewport, position);

    expect(hoveredBody(state, camera, viewport, pointer)).toEqual({ kind: "constructionSite" });
    expect(bodyOf(state, { kind: "constructionSite" })).toEqual(state.station.constructionSite);
    expect(infoBox(state, { kind: "constructionSite" })).toEqual({ title: "Construction site", line: "Metal: 12\nIce: 0" });
  });

  it("is not hoverable from another sector", () => {
    const state = withSite({ Metal: 1, Ice: 1 });
    const pointer = worldToScreen(camera, viewport, state.station.constructionSite.position);

    expect(hoveredBody(state, camera, viewport, pointer, 1)?.kind).not.toBe("constructionSite");
  });

  it("does not hide a ship that is unloading on it", () => {
    const state = withShip({ state: "unloading", position: createInitialState(7).station.constructionSite.position });
    const pointer = worldToScreen(camera, viewport, state.ships[0]!.position);

    expect(hoveredBody(state, camera, viewport, pointer)).toEqual({ kind: "ship", index: 0 });
  });

  it("does not count a ship unloading there against the Dock's berths", () => {
    const state = withShip({ state: "unloading", cargo: 5, cargoMaterial: "Metal", transfer: { startingCargo: 5, amount: 5, destination: "constructionSite" } });

    expect(infoBox(state, { kind: "dock" })?.line).toBe("Occupied 0 / 6");
  });

  it("takes a right-click as an order to supply it", () => {
    const state = createInitialState(7);

    expect(orderTargetAt(state, { kind: "constructionSite" }, { x: 0, y: 0 })).toEqual({ kind: "supplyBuild" });
  });
});

describe("the + menu", () => {
  it("never greys out module choices", () => {
    expect(buildMenuItems(withSite({ Metal: 0, Ice: 0 })).every((item) => !item.disabled)).toBe(true);
  });

  it("keeps short choices enabled and says what is missing on hover", () => {
    const items = buildMenuItems(withSite({ Metal: 30, Ice: 10 }));

    expect(items.map(({ disabled, title }) => ({ disabled, title })))
      .toEqual(Array(3).fill({ disabled: false, title: "Needs 15 more Ice" }));
  });

  it("names both materials when both are short", () => {
    expect(buildMenuItems(withSite({ Metal: 0, Ice: 0 }))[0]).toMatchObject({ title: "Needs 25 more Metal and 25 more Ice" });
  });

  it("has no hover text for an option the site can pay", () => {
    expect(buildMenuItems(withSite({ Metal: 25, Ice: 25 }))).toEqual([
      { type: "Dock", cost: "25 Metal, 25 Ice", disabled: false, title: "" },
      { type: "Storage", cost: "25 Metal, 25 Ice", disabled: false, title: "" },
      { type: "Builder", cost: "25 Metal, 25 Ice", disabled: false, title: "" },
    ]);
  });

  it("allows another module to be queued while one is being built", () => {
    const state = withSite({ Metal: 50, Ice: 50 });
    const building = { ...state, station: { ...state.station, construction: { type: "Dock" as const, position: { x: 80, y: 0 }, size: { width: 40, height: 70 }, timer: 5 } } };

    expect(buildMenuItems(building)[0]).toMatchObject({ disabled: false, title: "" });
  });
});

describe("a ship supplying the site", () => {
  it("reads that it is waiting at Home when nothing is queued", () => {
    const state = withShip({ defaultBehaviour: "supply", state: "holding", cargo: 7, cargoMaterial: "Metal" });
    expect(shipStatus(state, state.ships[0]!)).toBe("Waiting at Home: nothing queued");
  });

  it("does not call a supply ship at a Move point Home when its queue is empty", () => {
    const base = createInitialState(7);
    const ship = { ...base.ships[0]!, defaultBehaviour: "supply" as const, state: "holding" as const,
      sectorId: 1, position: { x: 300, y: 300 }, order: null };
    const state = { ...base, ships: [ship] };
    expect(shipStatus(state, ship)).toBe("Holding");
  });

  it("is on its own default in the panel", () => {
    expect(selectionPanel(withShip({ defaultBehaviour: "supply" }), [0])).toMatchObject({ defaultBehaviour: "supply" });
  });

  it("says where it is flying and what it is unloading into", () => {
    const flying = withShip({ defaultBehaviour: "supply", state: "homebound", cargo: 10, cargoMaterial: "Ice" });
    expect(shipStatus(flying, flying.ships[0]!)).toBe("Flying to the construction site with 10 Ice");

    const unloading = withShip({ defaultBehaviour: "supply", state: "unloading", cargo: 4, cargoMaterial: "Ice", transfer: { startingCargo: 10, amount: 10, destination: "constructionSite" } });
    expect(shipStatus(unloading, unloading.ships[0]!)).toBe("Unloading into the construction site");
  });

  it("shows the unloading, not the order, while an ordered ship is unloading into the site", () => {
    const state = withShip({ state: "unloading", cargo: 4, cargoMaterial: "Ice", order: { kind: "supplyBuild", point: { x: 75, y: -60 }, sectorId: 0 },
      transfer: { startingCargo: 10, amount: 10, destination: "constructionSite" } });

    expect(shipStatus(state, state.ships[0]!)).toBe("Unloading into the construction site");
    expect(selectionPanel(state, [0])?.rows[0]?.status).toBe("Unloading into the construction site");
  });

  it("reads its once-only order in words", () => {
    const state = withShip({ state: "moving", cargo: 10, cargoMaterial: "Ice", order: { kind: "supplyBuild", point: { x: 75, y: -60 }, sectorId: 0 } });

    expect(shipStatus(state, state.ships[0]!)).toBe("Order: supply construction site");
    expect(selectionPanel(state, [0])?.rows[0]?.status).toBe("Order: supply construction site");
  });
});
