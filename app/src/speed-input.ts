import type { UiState } from "./ui-state";
import { clockAfterButton, clockAfterKey, type SpeedButtonId } from "./speed";
import { dismissBuildMenuForKey } from "./building";
import type { InputActions } from "./input-context";
import { mapToggled } from "./sectors";

export function installSpeedInput(ui: UiState, speedControls: HTMLElement, actions: Pick<InputActions, "closeBuildMenu" | "closeGateMenu" | "closeShipMenu">): void {
  const { closeBuildMenu, closeGateMenu, closeShipMenu } = actions;
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") ui.pendingStation = false;
    if (event.key.toLowerCase() === "m" || event.key === "Escape") ui.mapOpen = mapToggled(ui.mapOpen, event.key);
    if (event.key === "Escape") closeGateMenu();
    if (ui.buildMenuOpen && dismissBuildMenuForKey(event.key)) closeBuildMenu();
    if (ui.shipMenuBuilder !== null && event.key === "Escape") closeShipMenu();
    if (!(event.target instanceof HTMLSelectElement) && !(event.target instanceof HTMLInputElement)) {
      ui.heldKeys.add(event.key);
      const next = clockAfterKey(ui.clock, event.key, event.repeat);
      if (next !== ui.clock || event.key === " ") { ui.clock = next; event.preventDefault(); }
    }
    if (event.key.startsWith("Arrow")) event.preventDefault();
  });
  window.addEventListener("keyup", (event) => { ui.heldKeys.delete(event.key); ui.heldKeys.delete(event.key.toLowerCase()); });
  window.addEventListener("blur", () => ui.heldKeys.clear());

  speedControls.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-speed]");
    if (!target) return;
    ui.clock = clockAfterButton(ui.clock, target.dataset.speed as SpeedButtonId);
    // Focus would make a later Space press click this button as well.
    target.blur();
  });
}
