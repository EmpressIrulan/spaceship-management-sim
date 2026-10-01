import { describe, expect, it } from "vitest";
import { CLAIM_BUILD_SECONDS, createInitialState, type SimState } from "sim";
import { bodyOf, fitCamera, hoveredBody, worldToScreen } from "./camera";
import { infoBox } from "./labels";
import { mapHit, mapLayout, renameHit } from "./sectors";
import { orderTargetAt } from "./selection";

const viewport = { width: 1000, height: 640 };

function withSite(changes: Partial<SimState["claimSites"][number]> = {}, sectorId = 1): SimState {
  const state = createInitialState(7);
  return { ...state, nextClaimSiteId: 1,
    claimSites: [{ id: 0, sectorId, position: { x: 300, y: 300 }, stage: 0, delivered: { Metal: 18, Ice: 25 }, timer: null, ...changes }] };
}

describe("claim site hover", () => {
  it("shows what the site is building and what it still needs, then what comes next", () => {
    expect(infoBox(withSite(), { kind: "claimSite", id: 0 })).toEqual({
      title: "Claim site",
      line: "Dock: Metal 18/25, Ice 25/25\nThen: Storage",
    });
  });

  it("counts down a module that is fully supplied", () => {
    const site = withSite({ delivered: { Metal: 25, Ice: 25 }, timer: CLAIM_BUILD_SECONDS - 0.4 });
    expect(infoBox(site, { kind: "claimSite", id: 0 })!.line).toBe(`Building Dock: ${CLAIM_BUILD_SECONDS} s\nThen: Storage`);
  });

  it("has nothing to follow the last module and offers no removal before it is built", () => {
    const info = infoBox(withSite({ stage: 1, delivered: { Metal: 0, Ice: 5 } }), { kind: "claimSite", id: 0 })!;
    expect(info.line).toBe("Storage: Metal 0/25, Ice 5/25");
    expect(info.action).toBeUndefined();
  });

  it("offers Remove site once the Dock and the first Storage are built", () => {
    expect(infoBox(withSite({ stage: 2, delivered: { Metal: 0, Ice: 0 } }), { kind: "claimSite", id: 0 })).toEqual({
      title: "Claim station",
      line: "Dock and Storage built",
      action: { label: "Remove site", siteId: 0 },
    });
  });
});

describe("Dock hover", () => {
  it("does not count a ship unloading at a claim site", () => {
    const state = withSite({}, 0);
    const ship = { ...state.ships[0]!, state: "unloading" as const, order: { kind: "supplySite" as const, siteId: 0, point: { x: 300, y: 300 }, sectorId: 0 } };
    expect(infoBox({ ...state, ships: [ship] }, { kind: "dock" })!.line).toMatch(/^Unloading 0 \//);
    expect(infoBox({ ...state, ships: [{ ...ship, order: null }] }, { kind: "dock" })!.line).toMatch(/^Unloading 1 \//);
  });
});

describe("claim site in the world", () => {
  it("is hovered inside the sector it is in, and not from another sector", () => {
    const state = withSite();
    const camera = fitCamera(viewport, [{ position: { x: 300, y: 300 }, size: { width: 70, height: 40 } }]);
    const at = worldToScreen(camera, viewport, { x: 320, y: 300 });
    expect(hoveredBody(state, camera, viewport, at, 1)).toEqual({ kind: "claimSite", id: 0 });
    expect(hoveredBody(state, camera, viewport, at, 0)).toBeNull();
    expect(bodyOf(state, { kind: "claimSite", id: 0 })).toMatchObject({ position: { x: 300, y: 300 }, size: { width: 70, height: 40 } });
  });

  it("makes a right-click on an unfinished site an order to supply it, and on a finished one a plain move", () => {
    const world = { x: 310, y: 300 };
    expect(orderTargetAt(withSite(), { kind: "claimSite", id: 0 }, world, 1)).toEqual({ kind: "supplySite", siteId: 0 });
    expect(orderTargetAt(withSite({ stage: 2 }), { kind: "claimSite", id: 0 }, world, 1)).toEqual({ kind: "move", point: world, sectorId: 1 });
  });
});

describe("renaming a sector from the map", () => {
  it("marks only the sectors with a finished claim station, and hits their rename label", () => {
    const state = withSite({ stage: 2 }, 2);
    const layout = mapLayout(state, viewport);
    expect(layout.circles.map((circle) => circle.claimed)).toEqual([false, false, true, false]);
    const claimed = layout.circles[2]!;
    const label = renameHit(layout, { x: claimed.center.x, y: claimed.center.y + 34 });
    expect(label).toBe(2);
    expect(mapHit(layout, { x: claimed.center.x, y: claimed.center.y + 34 })).toBe(2);
    const unclaimed = layout.circles[1]!;
    expect(renameHit(layout, { x: unclaimed.center.x, y: unclaimed.center.y + 34 })).toBeNull();
    expect(renameHit(layout, { x: claimed.center.x, y: claimed.center.y - 30 })).toBeNull();
  });
});
