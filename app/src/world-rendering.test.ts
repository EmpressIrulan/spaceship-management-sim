import { describe, expect, it, vi } from "vitest";
import {
  BUG_SIZE,
  BUG_BITE_SECONDS,
  DROP_SIZE,
  HIVE_SIZE,
  createInitialState,
  type Bug,
  type Drop,
  type DropKind,
  type Hive,
  type Ship,
  type SimState,
  type Vec,
} from "sim";
import { createWorldDrawing } from "./world-rendering";
import { createUiState } from "./ui-state";

vi.mock("./ships", () => ({ shipSprite: () => ({}), slotColor: () => "#facc15" }));

const viewport = { width: 800, height: 600 };
const camera = { center: { x: 0, y: 0 }, zoom: 1 };

function mockCtx() {
  const gradient = { addColorStop: vi.fn() };
  return {
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    translate: vi.fn(),
    setLineDash: vi.fn(),
    createRadialGradient: vi.fn(() => gradient),
    createLinearGradient: vi.fn(() => gradient),
  } as unknown as CanvasRenderingContext2D;
}

function ui(sector = 0) {
  const state = createUiState([]);
  state.camera = camera;
  state.viewport = viewport;
  state.currentSector = sector;
  return state;
}

function hive(sector: number, position: Vec, alive = true): Hive {
  return { id: 1, sectorId: sector, position, hp: 200, maxHp: 200, spawnTimer: 5, alive };
}

function bug(sector: number, position: Vec, targetShipId: number | null = null): Bug {
  return {
    id: 2,
    hiveId: 1,
    sectorId: sector,
    position,
    hp: 6,
    maxHp: 6,
    state: targetShipId === null ? "hovering" : "hunting",
    targetShipId,
    leg: null,
    timer: 3,
  };
}

function drop(sector: number, kind: DropKind, position: Vec): Drop {
  return { id: 3, sectorId: sector, kind, position };
}

function withBodies(state: SimState, bodies: { stations?: SimState["stations"]; ships?: Ship[]; hives?: Hive[]; bugs?: Bug[]; drops?: Drop[] }): SimState {
  return { ...state, ...bodies };
}

const AT = { x: 40, y: -20 };

describe("the world draws the hive and its bugs", () => {
  it("draws the hive of the sector on its spot", () => {
    const uiState = ui();
    const ctx = mockCtx();
    const fillWorldRect = vi.fn();
    const strokeWorldRect = vi.fn();
    const drawing = createWorldDrawing(uiState, () => withBodies(createInitialState(7), {
      hives: [hive(0, AT)],
    }), ctx, fillWorldRect, strokeWorldRect);
    drawing.draw(0);
    expect(fillWorldRect).toHaveBeenCalledWith(AT, HIVE_SIZE, "#7c3aed");
  });

  it("draws every bug, but not a bug of another sector or a dead hive", () => {
    const uiState = ui();
    const ctx = mockCtx();
    const fillWorldRect = vi.fn();
    const drawing = createWorldDrawing(uiState, () => withBodies(createInitialState(7), {
      hives: [hive(0, AT, false)],
      bugs: [bug(0, AT), bug(1, { x: 0, y: 0 })],
    }), ctx, fillWorldRect, vi.fn());
    drawing.draw(0);
    expect(fillWorldRect).toHaveBeenCalledWith(AT, BUG_SIZE, "#c084fc");
  });

  it("draws a bug juice drop and a queen larvae drop, each its own colour", () => {
    const uiState = ui();
    const ctx = mockCtx();
    const fillWorldRect = vi.fn();
    const drawing = createWorldDrawing(uiState, () => withBodies(createInitialState(7), {
      drops: [drop(0, "bugJuice", AT), drop(0, "queenLarvae", { x: 5, y: 5 })],
    }), ctx, fillWorldRect, vi.fn());
    drawing.draw(0);
    expect(fillWorldRect).toHaveBeenCalledWith(AT, DROP_SIZE, "#84cc16");
    expect(fillWorldRect).toHaveBeenCalledWith({ x: 5, y: 5 }, DROP_SIZE, "#fde68a");
  });
});

function shotState(ship: Ship, bugs: Bug[] = []): SimState {
  // No station draws beside the ships, so each beam path is a shot or a bite.
  return withBodies(createInitialState(7), { ships: [ship], bugs, stations: [] });
}

const SHOT = { from: { x: 0, y: 0 }, to: { x: 30, y: 30 }, target: { kind: "bug" as const, id: 1 }, timer: 0.2 };

describe("the world draws gun shots", () => {
  it("draws a projectile between its ship and aim, without a line", () => {
    const uiState = ui();
    const ctx = mockCtx();
    const fillWorldRect = vi.fn();
    const strokeWorldRect = vi.fn();
    const base = createInitialState(7).ships[0]!;
    const ship = { ...base, id: 9, position: { x: 0, y: 0 }, gunTimer: 2, gunShot: SHOT };
    const drawing = createWorldDrawing(uiState, () => shotState(ship), ctx, fillWorldRect, strokeWorldRect);
    drawing.draw(0);
    // worldToScreen with the test camera maps world (x, y) to (400 + x, 300 + y).
    expect(ctx.moveTo).not.toHaveBeenCalled();
    expect(ctx.lineTo).not.toHaveBeenCalled();
    expect(ctx.fillRect).toHaveBeenCalledWith(416, 316, 4, 4);
  });

  it("draws nothing for a ship with no shot in flight", () => {
    const uiState = ui();
    const ctx = mockCtx();
    const base = createInitialState(7).ships[0]!;
    const ship = { ...base, id: 9, position: { x: 0, y: 0 } };
    const drawing = createWorldDrawing(uiState, () => shotState(ship), ctx, vi.fn(), vi.fn());
    drawing.draw(0);
    expect(ctx.moveTo).not.toHaveBeenCalled();
    expect(ctx.lineTo).not.toHaveBeenCalled();
  });

  it("draws a bite as a flash between the bug and the ship it is biting", () => {
    const uiState = ui();
    const ctx = mockCtx();
    const base = createInitialState(7).ships[0]!;
    const ship = { ...base, id: 9, position: { x: 0, y: 0 } };
    const biting = { ...bug(0, { x: 8, y: 0 }, 9), timer: BUG_BITE_SECONDS };
    const drawing = createWorldDrawing(uiState, () => shotState(ship, [biting]), ctx, vi.fn(), vi.fn());
    drawing.draw(0);
    expect(ctx.moveTo).toHaveBeenCalledWith(408, 300);
    expect(ctx.lineTo).toHaveBeenCalledWith(400, 300);
  });

  it("does not keep drawing a bite throughout its cooldown or track a moved quarry", () => {
    const uiState = ui();
    const ctx = mockCtx();
    const base = createInitialState(7).ships[0]!;
    const ship = { ...base, id: 9, position: { x: 0, y: 0 } };
    let biteBug = { ...bug(0, { x: 8, y: 0 }, 9), timer: BUG_BITE_SECONDS - 0.3 };
    let state = shotState(ship, [biteBug]);
    const drawing = createWorldDrawing(uiState, () => state, ctx, vi.fn(), vi.fn());
    drawing.draw(0);
    expect(ctx.moveTo).toHaveBeenCalledTimes(1);
    (ctx.moveTo as unknown as { mockClear: () => void }).mockClear();
    (ctx.lineTo as unknown as { mockClear: () => void }).mockClear();
    biteBug = { ...biteBug, timer: BUG_BITE_SECONDS - 1, position: { x: 12, y: 0 } };
    state = shotState({ ...ship, position: { x: 100, y: 0 } }, [biteBug]);
    drawing.draw(1);
    expect(ctx.moveTo).not.toHaveBeenCalled();
    expect(ctx.lineTo).not.toHaveBeenCalled();
  });
});

describe("a hull that vanishes between frames explodes", () => {
  it("blasts once on the spot where the ship was last seen, then fades", () => {
    const uiState = ui();
    const ctx = mockCtx();
    const fillWorldRect = vi.fn();
    const strokeWorldRect = vi.fn();
    const base = createInitialState(7).ships[0]!;
    const ship = { ...base, id: 9, position: AT };
    let state = shotState(ship);
    const drawing = createWorldDrawing(uiState, () => state, ctx, fillWorldRect, strokeWorldRect);
    drawing.draw(0);
    // One frame later the whole hull is gone: the sim removes it in a step.
    state = withBodies(state, { ships: [] });
    drawing.draw(0.25);
    expect(ctx.arc).not.toHaveBeenCalled();
    expect(ctx.fillRect).toHaveBeenCalled();
    (ctx.fillRect as unknown as { mockClear: () => void }).mockClear();
    // Past the blast's life, nothing is left to draw.
    drawing.draw(5);
    expect((ctx.fillRect as unknown as { mock: { calls: number[][] } }).mock.calls
      .some((call) => call[2] === 4 && call[3] === 4)).toBe(false);
  });

  it("never blasts for a hull that only changed where it was", () => {
    const uiState = ui();
    const ctx = mockCtx();
    const base = createInitialState(7).ships[0]!;
    const alive = { ...base, id: 9, position: AT };
    const moved = { ...alive, position: { x: 60, y: 60 } };
    let state = shotState(alive);
    const drawing = createWorldDrawing(uiState, () => state, ctx, vi.fn(), vi.fn());
    drawing.draw(0.25);
    state = shotState(moved);
    drawing.draw(0.5);
    expect(ctx.arc).not.toHaveBeenCalled();
  });

  it.each(["docked", "jumpingOut"] as const)("does not blast when a living ship enters %s", (nextState) => {
    const uiState = ui();
    const ctx = mockCtx();
    const base = createInitialState(7).ships[0]!;
    const ship = { ...base, id: 9, position: AT };
    let state = shotState(ship);
    const drawing = createWorldDrawing(uiState, () => state, ctx, vi.fn(), vi.fn());
    drawing.draw(0.25);
    state = shotState({ ...ship, state: nextState });
    drawing.draw(0.5);
    expect(ctx.arc).not.toHaveBeenCalled();
  });

  it("blasts nothing when the sector changes view", () => {
    const uiState = ui(0);
    const ctx = mockCtx();
    const base = createInitialState(7).ships[0]!;
    const ship = { ...base, id: 9, position: AT, sectorId: 0 };
    let state = shotState(ship);
    const drawing = createWorldDrawing(uiState, () => state, ctx, vi.fn(), vi.fn());
    drawing.draw(0.25);
    uiState.currentSector = 1;
    state = shotState({ ...ship, sectorId: 1 });
    drawing.draw(0.5);
    expect(ctx.arc).not.toHaveBeenCalled();
  });
});

describe("a shield hit flashes around the ship", () => {
  it("draws a blue ring once when the shield hit timestamp changes", () => {
    const uiState = ui();
    const ctx = mockCtx();
    const base = createInitialState(7).ships[0]!;
    let state = shotState({ ...base, id: 9, shield: 20, maxShield: 20, shieldLastHit: undefined });
    const drawing = createWorldDrawing(uiState, () => state, ctx, vi.fn(), vi.fn());
    drawing.draw(0);
    state = shotState({ ...state.ships[0]!, shield: 12, shieldLastHit: 1 });
    drawing.draw(1);
    expect(ctx.arc).toHaveBeenCalled();
    expect(ctx.strokeStyle).toBe("#38bdf8");
    (ctx.arc as unknown as { mockClear: () => void }).mockClear();
    drawing.draw(1.4);
    expect(ctx.arc).not.toHaveBeenCalled();
  });
});
