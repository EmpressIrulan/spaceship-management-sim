import { describe, expect, it } from "vitest";
import { createInitialState, stationById, type SimState, type Vec } from "sim";
import { placeStation } from "./station-placement";
import { tick } from "./tick";

// A zoomed view clicks positions like these. The Dock and Storage sit 40 apart,
// and the spacing check misses by a rounding step at this position.
const FRACTIONAL: Vec = { x: -511.9786, y: 0 };
const WHOLE: Vec = { x: -512, y: 0 };

function fundedSite(state: SimState, id: number): SimState {
  return { ...state, stations: state.stations.map((station) => station.id === id ? {
    ...station, constructionSite: { ...station.constructionSite, inventory: { Metal: 50, Ice: 50 } },
  } : station) };
}

// Steps the sim the way the game does, in short ticks, until the founding
// queue has built out or the limit runs out.
function buildOut(state: SimState, id: number, limit = 90): SimState {
  let next = state;
  for (let elapsed = 0; elapsed < limit; elapsed += 1 / 30) {
    const station = stationById(next, id)!;
    if (!station.construction && station.buildQueue.length === 0) return next;
    next = tick(next, 1 / 30);
  }
  throw new Error("founding build never finished");
}

describe("a station placed at any position builds its Dock and Storage", () => {
  it.each([
    ["a whole-number position", WHOLE],
    ["a fractional position, as when the view is zoomed", FRACTIONAL],
  ])("%s keeps both modules and refunds nothing", (_label, position) => {
    const placed = placeStation(createInitialState(7), 1, position);
    const id = placed.nextStationId - 1;
    expect(stationById(placed, id)).toBeDefined();

    const built = buildOut(fundedSite(placed, id), id);

    const station = stationById(built, id)!;
    expect(station.modules.map((module) => module.type)).toEqual(["Dock", "Storage"]);
    expect(station.constructionSite.inventory).toEqual({ Metal: 0, Ice: 0 });
  });
});
