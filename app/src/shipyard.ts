import {
  MATERIALS,
  MAX_HULL,
  availableShipBuild,
  shipBuildCost,
  shipBuildSeconds,
  shipStats,
  type ShipDesign,
  type ShipModule,
  type SimState,
} from "sim";

// The design being painted in the Build ship menu, plus the module the next
// slot click paints. A null brush clears slots.
export interface ShipDraft extends ShipDesign {
  brush: ShipModule | null;
}

// Placeholder starting size. The menu opens empty every time until savable
// blueprints (#30) exist.
export function emptyDraft(): ShipDraft {
  return { width: 2, height: 2, slots: [null, null, null, null], brush: "Engine" };
}

function clampSide(n: number): number {
  return Math.min(MAX_HULL, Math.max(1, Math.round(n)));
}

// Modules that still fit the new hull keep their place.
export function resizeDraft(draft: ShipDraft, width: number, height: number): ShipDraft {
  const w = clampSide(width);
  const h = clampSide(height);
  const slots: ShipDraft["slots"] = [];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      slots.push(x < draft.width && y < draft.height ? draft.slots[y * draft.width + x]! : null);
    }
  }
  return { ...draft, width: w, height: h, slots };
}

export function withBrush(draft: ShipDraft, brush: ShipModule | null): ShipDraft {
  return { ...draft, brush };
}

export function paintSlot(draft: ShipDraft, index: number): ShipDraft {
  if (index < 0 || index >= draft.slots.length) return draft;
  const slots = [...draft.slots];
  slots[index] = draft.brush;
  return { ...draft, slots };
}

export function designOf(draft: ShipDraft): ShipDesign {
  return { width: draft.width, height: draft.height, slots: [...draft.slots] };
}

// Whole seconds under a minute, then minutes with any seconds left over.
export function formatDuration(seconds: number): string {
  const whole = Math.round(seconds);
  if (whole < 60) return `${whole} s`;
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

export interface StatsView {
  speed: string;
  hold: string;
  miningTime: string;
}

export function statsView(design: ShipDesign): StatsView {
  const stats = shipStats(design);
  return {
    speed: String(Math.round(stats.speed)),
    hold: String(stats.hold),
    miningTime: stats.miningSeconds === null ? "no laser" : formatDuration(stats.miningSeconds),
  };
}

export interface ShipMenuView {
  stats: StatsView;
  cost: string;
  canBuild: boolean;
}

export function shipMenuView(state: SimState, builder: number, draft: ShipDraft): ShipMenuView {
  const design = designOf(draft);
  const cost = shipBuildCost(design);
  return {
    stats: statsView(design),
    cost: `${MATERIALS.map((material) => `${cost[material]} ${material}`).join(" ")}, ${
      formatDuration(shipBuildSeconds(design))
    }`,
    canBuild: availableShipBuild(state, builder, design),
  };
}
