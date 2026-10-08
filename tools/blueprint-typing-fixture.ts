import type { SimState } from "sim";
import type { UiState } from "../app/src/ui-state";

declare global {
  interface Window {
    blueprintTypingDemo: {
      openMenu: () => void;
      snapshot: () => {
        mapOpen: boolean;
        speed: number;
        paused: boolean;
        blueprintName: string | null;
        shipMenuOpen: boolean;
      };
    };
  }
}

export function installBlueprintTypingFixture(
  ui: UiState,
  getState: () => SimState,
  openShipMenu: (builder: number, stationId?: number) => void,
): void {
  Object.assign(window, {
    blueprintTypingDemo: {
      openMenu: () => openShipMenu(getState().ships[0]?.id ?? 0),
      snapshot: () => ({
        mapOpen: ui.mapOpen,
        speed: ui.clock.speed,
        paused: ui.clock.paused,
        blueprintName: document.querySelector<HTMLInputElement>(".blueprint-name")?.value ?? null,
        shipMenuOpen: ui.shipMenuBuilder !== null,
      }),
    },
  });
}
