import { type SimState, type ShipDesign, type HaulStationId } from "sim";
import { selectionPanel, type MaterialBox } from "./selection";
import { shipPanel, shipSprite } from "./ships";

export interface ShipPanelContext {
  selectedShips: number[];
  selectedShip: number | null;
  renderedPanel: string;
}

// A small picture of a ship, scaled to fit the panel.
function thumbnailElement(design: ShipDesign): HTMLElement {
  const thumb = document.createElement("canvas");
  thumb.width = design.width;
  thumb.height = design.height;
  thumb.className = "ship-thumb";
  const scale = Math.min(176 / design.width, 120 / design.height, 24);
  thumb.style.width = `${design.width * scale}px`;
  thumb.style.height = `${design.height * scale}px`;
  thumb.getContext("2d")!.drawImage(shipSprite(design), 0, 0);
  return thumb;
}


export function renderShipPanel(state: SimState, shipPanelBox: HTMLElement, context: ShipPanelContext): ShipPanelContext {
  context.selectedShips = context.selectedShips.filter((id) => state.ships.some((ship) => ship.id === id));
  context.selectedShip = context.selectedShips[0] ?? null;
  const panel = context.selectedShip === null ? null : shipPanel(state, context.selectedShip);
  const list = selectionPanel(state, context.selectedShips);
  shipPanelBox.hidden = !panel || !list;
  // The design is left out of the key, since a capital ship's pixels are too
  // many to serialise every frame. The ship's id stands in for it.
  const key = JSON.stringify({ panel: { ...panel, design: null }, list, ship: context.selectedShip });
  if (!panel || !list || key === context.renderedPanel) return context;
  context.renderedPanel = key;
  const title = document.createElement("h2");
  title.textContent = context.selectedShips.length > 1 ? `${context.selectedShips.length} ships selected` : `Ship ${panel.size}`;
  const rows = document.createElement("dl");
  for (const row of list.rows) {
    const term = document.createElement("dt"); term.textContent = row.name;
    const detail = document.createElement("dd"); detail.textContent = row.status; rows.append(term, detail);
  }
  for (const [label, value] of context.selectedShips.length === 1 ? panel.rows : []) {
    const term = document.createElement("dt");
    term.textContent = label;
    const detail = document.createElement("dd");
    detail.textContent = value;
    detail.dataset.row = label;
    rows.append(term, detail);
  }
  const select = document.createElement("select"); select.name = "default";
  for (const [value, label] of [["mine", "Default: Mine for Station"], ["supply", "Default: Supply construction site"], ["haul", "Default: Haul"], ["none", "Default: None"]] as const) {
    const option = document.createElement("option"); option.value = value; option.textContent = label;
    if (value === "haul" && !list.canHaul) { option.disabled = true; option.title = list.haulDisabledReason ?? ""; }
    option.selected = list.defaultBehaviour === value; select.append(option);
  }
  if (list.defaultBehaviour === "mixed") { const mixed = document.createElement("option"); mixed.textContent = "Default: Mixed"; mixed.selected = true; select.prepend(mixed); }
  if (!list.canHaul) select.title = list.haulDisabledReason ?? "";
  const routeControls: HTMLElement[] = [];
  if (list.defaultBehaviour === "haul" && list.haulRoute) {
    const routeSelect = (name: "haul-from" | "haul-to", label: string, value: HaulStationId) => {
      const wrap = document.createElement("label"); wrap.textContent = `${label} `;
      const input = document.createElement("select"); input.name = name;
      for (const station of list.stations) { const option = document.createElement("option"); option.value = station.id; option.textContent = station.name; option.selected = station.id === value; input.append(option); }
      wrap.append(input); return wrap;
    };
    routeControls.push(routeSelect("haul-from", "From", list.haulRoute.from), routeSelect("haul-to", "To", list.haulRoute.to));
    const material = document.createElement("label"); material.textContent = "Material ";
    const materialSelect = document.createElement("select"); materialSelect.name = "haul-material";
    for (const value of ["Metal", "Ice"] as const) { const option = document.createElement("option"); option.value = value; option.textContent = value; option.selected = value === list.haulRoute.material; materialSelect.append(option); }
    material.append(materialSelect); routeControls.push(material);
  }
  const resume = document.createElement("button"); resume.textContent = "Resume"; resume.dataset.resume = ""; resume.disabled = !list.canResume;
  shipPanelBox.replaceChildren(title, rows, select, ...routeControls, ...materialBoxes(list.materials),
    ...otherSectorsBox(list.mineOtherSectors), resume, ...(context.selectedShips.length === 1 ? [thumbnailElement(panel.design)] : []));
  return context;
}

// One tickbox per material for ships on Mine for Station. A box the selected
// ships disagree on is half-ticked, and clicking it ticks it for all of them.


function materialBoxes(boxes: MaterialBox[] | null): HTMLElement[] {
  return (boxes ?? []).map(({ material, ticked }) => {
    const input = document.createElement("input");
    input.type = "checkbox"; input.name = "mine-material"; input.value = material;
    input.checked = ticked === "on"; input.indeterminate = ticked === "mixed";
    const label = document.createElement("label");
    label.className = "mine-material"; label.append(input, ` ${material}`);
    return label;
  });
}

function otherSectorsBox(ticked: "on" | "off" | "mixed" | null): HTMLElement[] {
  if (ticked === null) return [];
  const input = document.createElement("input");
  input.type = "checkbox"; input.name = "mine-other-sectors";
  input.checked = ticked === "on"; input.indeterminate = ticked === "mixed";
  const label = document.createElement("label");
  label.className = "mine-material"; label.append(input, " Mine in other sectors");
  return [label];
}
