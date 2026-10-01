import { hangarCapacity, hangarContents, hangarUsed, type SimState } from "sim";

export function hangarPanelRows(state: SimState, shipId: number): [string, string][] {
  const ship = state.ships.find((candidate) => candidate.id === shipId);
  const capacity = ship ? hangarCapacity(ship.design) : 0;
  if (!ship || capacity === 0) return [];
  return [
    ["Hangar", `${hangarUsed(state, ship.id)}/${capacity}`],
    ["Docked ships", String(hangarContents(state, ship.id).length)],
  ];
}

export function launchAllButton(state: SimState, shipId: number): HTMLButtonElement | null {
  const ship = state.ships.find((candidate) => candidate.id === shipId);
  if (!ship || hangarCapacity(ship.design) === 0) return null;
  const button = document.createElement("button");
  button.textContent = "Launch all";
  button.dataset.launchAll = String(ship.id);
  button.disabled = hangarContents(state, ship.id).length === 0;
  return button;
}
