import { describe, expect, it } from "vitest";
import { DOCK_SIZE, MODULE_SPACING, createInitialState, homeStation, type SimState, type StationModule } from "sim";
import { availableModuleBuildSites, startModuleBuild } from "./station-building";
import { tick } from "./tick";

function layout(modules: StationModule[], state = createInitialState(31)): SimState {
  const station = homeStation(state);
  return {
    ...state,
    asteroids: [],
    stations: state.stations.map((candidate) => candidate.id === station.id
      ? { ...candidate, modules, construction: null, buildQueue: [], constructionSite: {
        ...candidate.constructionSite, inventory: { Metal: 500, Ice: 500 },
      } }
      : candidate),
  };
}

const dock = (x: number, y: number): StationModule => ({ type: "Dock", position: { x, y }, size: DOCK_SIZE });
const has = (state: SimState, x: number, y: number) => availableModuleBuildSites(state, 0)
  .some((site) => site.x === x && site.y === y);

describe("station growth story acceptance criteria", () => {
  it("offers all four cardinal sides of a free Dock, never diagonals", () => {
    const state = layout([dock(0, 0)]);
    expect(availableModuleBuildSites(state, 0)).toEqual(expect.arrayContaining([
      { x: -MODULE_SPACING, y: 0 }, { x: MODULE_SPACING, y: 0 },
      { x: 0, y: -MODULE_SPACING }, { x: 0, y: MODULE_SPACING },
    ]));
    expect(has(state, MODULE_SPACING, MODULE_SPACING)).toBe(false);
  });

  it("keeps each of the four build destinations available when the other sides are occupied", () => {
    for (const [x, y] of [[-40, 0], [40, 0], [0, -40], [0, 40]] as const) {
      const state = layout([dock(0, 0), dock(x, y)]);
      expect(has(state, x * 2, y * 2)).toBe(true);
    }
  });

  it("starts construction at the selected site in every cardinal direction", () => {
    for (const [x, y] of [[-40, 0], [40, 0], [0, -40], [0, 40]] as const) {
      const started = startModuleBuild(layout([dock(0, 0)]), 0, "Storage", { x, y });
      expect(homeStation(started).construction?.position).toEqual({ x, y });
      const finished = tick(started, 30);
      expect(homeStation(finished).modules.some((module) => module.position.x === x && module.position.y === y)).toBe(true);
    }
  });

  it("moves the hidden construction pad when a module is built on it, then offers another build site", () => {
    const base = layout([dock(0, 0), dock(40, 0)]);
    const spot = { x: 80, y: 0 };
    const initial = {
      ...base,
      stations: base.stations.map((station) => station.id === 0
        ? { ...station, constructionSite: { ...station.constructionSite, position: spot } }
        : station),
    };
    const pad = homeStation(initial).constructionSite.position;
    expect(pad).toEqual(spot);
    expect(has(initial, spot.x, spot.y)).toBe(true);

    const started = startModuleBuild(initial, 0, "Storage", spot);
    expect(homeStation(started).construction?.position).toEqual(spot);
    const finished = tick(started, 30);
    const station = homeStation(finished);
    expect(station.modules.some((module) => module.position.x === spot.x && module.position.y === spot.y)).toBe(true);
    expect(station.constructionSite.position).not.toEqual(spot);
    expect(availableModuleBuildSites(finished, 0).length).toBeGreaterThan(0);
  });

  // Every site is a cardinal neighbour slot of a module, so the full
  // expectation is derivable: a side with a module behind it must be hidden,
  // a free side must still be offered.
  const SIDES: ReadonlyArray<readonly [number, number]> = [
    [-MODULE_SPACING, 0], [0, -MODULE_SPACING], [0, MODULE_SPACING], [MODULE_SPACING, 0],
  ];

  function expectsEverySide(state: SimState, modules: StationModule[]) {
    const sites = availableModuleBuildSites(state, 0);
    for (const module of modules) {
      for (const [dx, dy] of SIDES) {
        const site = { x: module.position.x + dx, y: module.position.y + dy };
        const taken = modules.some((other) => other.position.x === site.x && other.position.y === site.y);
        if (taken) {
          expect(sites).not.toContainEqual(site);
        } else {
          expect(sites).toContainEqual(site);
        }
      }
    }
  }

  it("continues offering sites after a station has grown to twelve modules", () => {
    const modules = [-80, -40, 0, 40, 80].map((y) => dock(0, y))
      .concat([-120, -80, -40, 40, 80, 120, 160].map((x) => dock(x, 0)));
    expectsEverySide(layout(modules), modules);
  });

  it("offers each free side and hides each taken side on an L-shaped station of twelve modules", () => {
    const modules = [-80, -40, 0, 40, 80].map((y) => dock(0, y))
      .concat([40, 80, 120, 160, 200, 240, 280].map((x) => dock(x, 80)));
    expectsEverySide(layout(modules), modules);
  });

  it("hides a site overlapping a module, a large asteroid, or another station", () => {
    const modules = [dock(0, 0), dock(40, 0)];
    let state = layout(modules);
    expect(has(state, 40, 0)).toBe(false);

    // The rock centre is farther than the old 40-unit cutoff from the site,
    // while its footprint still overlaps the proposed Dock.
    state = { ...state, asteroids: [{ id: 100, sectorId: 0, rich: false, fieldId: 0,
      position: { x: 40, y: 40 }, size: { width: 80, height: 80 }, ore: 1, material: "Metal" }] };
    expect(has(state, 0, 40)).toBe(false);

    const home = homeStation(state);
    const other = { ...home, id: 99, name: "Other", modules: [dock(0, 40)], construction: null, buildQueue: [] };
    state = { ...state, asteroids: [], stations: [...state.stations, other] };
    expect(has(state, 0, 40)).toBe(false);
  });

  it("preserves the traditional left and right build sites", () => {
    const state = layout([dock(0, 0)]);
    expect(has(state, -MODULE_SPACING, 0)).toBe(true);
    expect(has(state, MODULE_SPACING, 0)).toBe(true);
  });
});
