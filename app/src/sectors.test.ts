import { describe, expect, it } from "vitest";
import { HOME_SECTOR, JUMP_SECONDS, createInitialState, orderMine, tick, type SimState } from "sim";
import { hoveredBody, worldToScreen, type Camera } from "./camera";
import { infoBox } from "./labels";
import { clickSelection, mapHit, mapLayout, mapToggled, shipsIn } from "./sectors";

const viewport = { width: 800, height: 600 };
const camera: Camera = { center: { x: 0, y: 0 }, zoom: 0.5 };
const FAR = 1;

function at(point: { x: number; y: number }) {
  return worldToScreen(camera, viewport, point);
}

// Runs until `done` holds, failing rather than looping forever.
function runUntil(state: SimState, done: (s: SimState) => boolean): SimState {
  let next = state;
  for (let t = 0; t < 600; t += 1 / 60) {
    if (done(next)) return next;
    next = tick(next, 1 / 60);
  }
  throw new Error("condition not reached");
}

describe("viewing one sector", () => {
  it("hovers rocks only in the sector on screen", () => {
    const state = createInitialState(11);
    const home = state.asteroids.find((a) => a.sectorId === HOME_SECTOR)!;
    const far = state.asteroids.find((a) => a.sectorId === FAR)!;
    expect(hoveredBody(state, camera, viewport, at(far.position), FAR)).toEqual({ kind: "asteroid", id: far.id });
    expect(hoveredBody(state, camera, viewport, at(home.position), FAR)).not.toEqual({ kind: "asteroid", id: home.id });
    expect(hoveredBody(state, camera, viewport, at(home.position), HOME_SECTOR)).toEqual({ kind: "asteroid", id: home.id });
  });

  it("has no station in the far sector", () => {
    const state = createInitialState(11);
    expect(hoveredBody(state, camera, viewport, at(state.station.dock.position), FAR)).toBeNull();
  });

  it("names the far end of each gate on hover", () => {
    const state = createInitialState(11);
    const [home, far] = state.sectors;
    const homeGate = hoveredBody(state, camera, viewport, at(home!.gate.position), HOME_SECTOR);
    const farGate = hoveredBody(state, camera, viewport, at(far!.gate.position), FAR);
    expect(infoBox(state, homeGate)?.title).toBe(`Gate to ${far!.name}`);
    expect(infoBox(state, farGate)?.title).toBe(`Gate to ${home!.name}`);
  });

  it("hides a jumping ship and shows it as Jumping on the gate", () => {
    const start = createInitialState(11);
    const rock = start.asteroids.find((a) => a.sectorId === FAR)!;
    const jumping = runUntil(orderMine(start, [0], rock.id), (s) => s.ships[0]!.state === "jumpingOut");
    const gate = start.sectors[HOME_SECTOR]!.gate.position;
    const hovered = hoveredBody(jumping, camera, viewport, at(gate), HOME_SECTOR);
    expect(hovered).toEqual({ kind: "gate", sectorId: HOME_SECTOR });
    expect(infoBox(jumping, hovered)?.line).toBe("Jumping: 1 ship");
    expect(shipsIn(jumping, HOME_SECTOR)).toEqual([]);

    const through = tick(jumping, JUMP_SECONDS + 0.01);
    expect(shipsIn(through, FAR).map((s) => s.index)).toEqual([0]);
  });
});

describe("the map", () => {
  it("opens and closes on M", () => {
    expect(mapToggled(false, "m")).toBe(true);
    expect(mapToggled(true, "M")).toBe(false);
    expect(mapToggled(true, "Escape")).toBe(false);
    expect(mapToggled(false, "x")).toBe(false);
  });

  it("draws both sectors joined by the gate, with their ship counts", () => {
    const state = createInitialState(11);
    const layout = mapLayout(state, viewport);
    expect(layout.circles.map((c) => [c.name, c.ships])).toEqual([
      [state.sectors[0]!.name, 1],
      [state.sectors[1]!.name, 0],
    ]);
    expect(layout.links).toEqual([{ from: layout.circles[0]!.center, to: layout.circles[1]!.center }]);
  });

  it("switches to the sector whose circle is clicked", () => {
    const state = createInitialState(11);
    const layout = mapLayout(state, viewport);
    expect(mapHit(layout, layout.circles[1]!.center)).toBe(FAR);
    expect(mapHit(layout, layout.circles[0]!.center)).toBe(HOME_SECTOR);
    expect(mapHit(layout, { x: 0, y: 0 })).toBeNull();
  });
});

describe("selection", () => {
  it("selects a clicked ship and clears on empty space", () => {
    expect(clickSelection([], { kind: "ship", index: 0 })).toEqual([0]);
    expect(clickSelection([0], null)).toEqual([]);
    expect(clickSelection([0], { kind: "asteroid", id: 3 })).toEqual([0]);
  });
});
