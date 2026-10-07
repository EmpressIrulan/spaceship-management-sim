import { describe, expect, it } from "vitest";
import { createInitialState, sectorInGateRange, type SimState } from "sim";
import { claimHover, claimRing, dismissGatePlacement, gateTargetAllowed, mapHit, mapLayout, mapToggled, PLAYER_COLOUR, sectorBackdrop } from "./sectors";

// Sector 1 claimed by a Claim module on a station in it.
function claimedSector(state: SimState, sectorId: number): SimState {
  const home = state.stations[0]!;
  const claim = { type: "Claim" as const, position: { x: 0, y: 0 }, size: { width: 1, height: 1 } };
  return { ...state, stations: [...state.stations, { ...home, id: 99, sectorId, modules: [claim] }] };
}

describe("sector map", () => {
  it("toggles with M, closes with Escape, and otherwise stays open", () => {
    expect(mapToggled(false, "m")).toBe(true);
    expect(mapToggled(true, "M")).toBe(false);
    expect(mapToggled(true, "Escape")).toBe(false);
    expect(mapToggled(true, "x")).toBe(true);
  });

  it("shows both named sectors, their gate link and ship counts, and hit-tests circles", () => {
    const state = createInitialState(11);
    const layout = mapLayout(state, { width: 1000, height: 640 });
    expect(layout.circles.map((circle) => circle.name)).toEqual(state.sectors.map((sector) => sector.name));
    expect(layout.circles).toHaveLength(4);
    expect(layout.links).toHaveLength(1);
    expect(layout.circles.map((circle) => circle.ships)).toEqual([1, 0, 0, 0]);
    expect(mapHit(layout, layout.circles[1]!.center)).toBe(1);
    expect(mapHit(layout, { x: 0, y: 0 })).toBeNull();
  });

  it("gives every sector a distinct backdrop and matching map tint", () => {
    const state = createInitialState(11);
    const backdrops = state.sectors.map((sector) => sectorBackdrop(sector.id));
    const layout = mapLayout(state, { width: 1000, height: 640 });

    expect(new Set(backdrops.map((backdrop) => backdrop.background)).size).toBe(state.sectors.length);
    expect(new Set(backdrops.map((backdrop) => backdrop.starCount)).size).toBeGreaterThan(1);
    expect(layout.circles.map((circle) => circle.tint)).toEqual(backdrops.map((backdrop) => backdrop.tint));
  });

  it("swaps backdrop identity when the viewed sector changes", () => {
    expect(sectorBackdrop(0)).not.toEqual(sectorBackdrop(1));
    expect(sectorBackdrop(1).background).toBe("#321616");
    expect(sectorBackdrop(2).background).toBe("#07313a");
  });

  it("puts exactly two sectors within gate-building range of Home", () => {
    expect([1, 2, 3].filter((id) => sectorInGateRange(0, id))).toEqual([1, 3]);
  });

  it("adds a map link only when the player-built gate is paid", () => {
    const state = createInitialState(11);
    const project = { id: 0, ends: [{ sectorId: 0, position: { x: 1, y: 1 } }, { sectorId: 3, position: { x: 2, y: 2 } }] as [any, any],
      delivered: { Metal: 200, Ice: 200 }, complete: true };
    expect(mapLayout({ ...state, gateProjects: [project] }, { width: 1000, height: 640 }).links).toHaveLength(2);
    expect(mapLayout({ ...state, gateProjects: [{ ...project, complete: false }] }, { width: 1000, height: 640 }).links).toHaveLength(1);
  });

  it("clears a dismissed placement so ordinary map clicks are unrestricted", () => {
    const pending = { sectorId: 0, position: { x: 10, y: 20 } };
    expect(dismissGatePlacement(pending)).toBeNull();
    expect(gateTargetAllowed(null, 2)).toBe(true);
  });
});

describe("claimed sectors on the map", () => {
  const state = createInitialState(7);
  const viewport = { width: 1000, height: 640 };
  const layout = mapLayout(claimedSector(state, 1), viewport);
  const claimed = layout.circles.find((circle) => circle.id === 1)!;
  const unclaimed = layout.circles.find((circle) => circle.id === 2)!;

  it("hovers a claimed circle and names it Claimed", () => {
    expect(claimHover(layout, claimed.center)).toMatchObject({ id: 1, center: claimed.center, radius: claimed.radius });
  });

  it("gives an unclaimed circle no hover", () => {
    expect(claimHover(layout, unclaimed.center)).toBeNull();
  });

  it("gives nothing off every circle", () => {
    expect(claimHover(layout, { x: 1, y: 1 })).toBeNull();
  });

  it("rings a claimed circle in the player colour, outside its edge", () => {
    expect(claimRing(claimed)).toEqual({ radius: claimed.radius + 5, colour: PLAYER_COLOUR });
  });

  it("draws no ring round an unclaimed circle", () => {
    expect(claimRing(unclaimed)).toBeNull();
  });
});
