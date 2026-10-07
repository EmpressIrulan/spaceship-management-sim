import { describe, expect, it } from "vitest";
import { MODULE_COST, createInitialState, placeStation, setSupplyStation, stationById, type SimState } from "sim";
import { fitCamera, hoveredBody, worldToScreen, type Camera, type Viewport } from "./camera";
import { infoBox } from "./labels";
import { mapHit, mapLayout, renameHit } from "./sectors";
import { orderTargetAt } from "./selection";

const viewport: Viewport = { width: 1000, height: 640 };

// A placed site in sector 1, off to one side so nothing overlaps it.
function withSite(inventory = { Metal: 0, Ice: 0 }): SimState {
  const state = placeStation(createInitialState(7), 1, { x: 300, y: 300 });
  const id = state.nextStationId - 1;
  const site = stationById(state, id)!.constructionSite;
  return {
    ...state,
    stations: state.stations.map((station) => (station.id === id
      ? { ...station, constructionSite: { ...site, inventory: { ...inventory } } }
      : station)),
  };
}

function view(at: { x: number; y: number }): Camera {
  return fitCamera(viewport, [{ position: at, size: { width: 80, height: 70 } }]);
}

describe("placed site hover", () => {
  it("shows what the site has been delivered for its first Dock", () => {
    const state = withSite({ Metal: 12, Ice: 0 });
    const site = stationById(state, 1)!.constructionSite;
    const pointer = worldToScreen(view(site.position), viewport, site.position);
    expect(hoveredBody(state, view(site.position), viewport, pointer, 1)).toEqual({ kind: "constructionSite", id: 1 });
    expect(infoBox(state, { kind: "constructionSite", id: 1 })).toEqual({
      title: "Construction site",
      line: "Metal: 12\nIce: 0",
    });
  });

  it("is not hoverable in another sector's view", () => {
    const state = withSite();
    const site = stationById(state, 1)!.constructionSite;
    const pointer = worldToScreen(view(site.position), viewport, site.position);
    expect(hoveredBody(state, view(site.position), viewport, pointer, 0)).not.toEqual({ kind: "constructionSite", id: 1 });
  });
});

describe("placing a site selects it for supply", () => {
  it("the placed site becomes the supply target", () => {
    let state = withSite();
    const id = state.nextStationId - 1;
    state = setSupplyStation(state, id);
    expect(state.supplyStation).toBe(id);
    expect(stationById(state, id)!.modules).toEqual([]);
    expect(stationById(state, id)!.constructionSite.inventory).toEqual({ Metal: 0, Ice: 0 });
    expect(MODULE_COST).toEqual({ Metal: 25, Ice: 25 });
  });
});

describe("placed site on the map", () => {
  it("lands inside the sector circle it was placed for", () => {
    const state = withSite();
    const layout = mapLayout(state, viewport);
    const circle = layout.circles[1]!;
    expect(mapHit(layout, circle.center)).toBe(1);
    // The site has no Rename of its own until a station is founded in the sector.
    expect(renameHit(layout, { x: circle.center.x - 39, y: circle.center.y + 26 })).toBeNull();
  });
});
