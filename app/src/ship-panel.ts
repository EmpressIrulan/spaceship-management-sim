import { type SimState, type ShipDesign, type DefaultBehaviour } from "sim";
import { selectionPanel, type SelectionPanel } from "./selection";
import { shipPanel, shipSprite } from "./ships";
import { hangarPanelRows, launchAllButton, launchAllDisabled } from "./hangar-panel";

export interface ShipPanelContext {
  selectedShips: number[];
  selectedShip: number | null;
  renderedPanel: string;
}

type ShipPanel = NonNullable<ReturnType<typeof shipPanel>>;
interface Frame { state: SimState; panel: ShipPanel; list: SelectionPanel; hangarRows: [string, string][] }
// Updates one built panel from the ship's current state.
type Sync = (frame: Frame) => void;
interface ControlOption { value: string; label: string; disabled?: boolean; title?: string }

// The sync for the panel each box holds. A box gets a new one only when its selection changes.
const syncs = new WeakMap<HTMLElement, Sync>();
// The options each select was last built with, so an unchanged list is left in place.
const optionKeys = new WeakMap<HTMLSelectElement, string>();

const BEHAVIOURS: [DefaultBehaviour, string][] = [
  ["mine", "Default: Mine for Station"], ["supply", "Default: Supply construction site"], ["haul", "Default: Haul"], ["none", "Default: None"],
];

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
  const shipId = context.selectedShip;
  if (!panel || !list || shipId === null) return context;
  const frame: Frame = { state, panel, list, hangarRows: hangarPanelRows(state, shipId) };
  // Only the selection decides what gets built. A change to the ship, such as its state, its cargo or its
  // mode, is patched into the controls that are already on screen, so a dropdown the player has open is not thrown away.
  const key = JSON.stringify({ ships: context.selectedShips, hangar: frame.hangarRows.length > 0 });
  if (key !== context.renderedPanel) {
    context.renderedPanel = key;
    syncs.set(shipPanelBox, buildShipPanel(shipPanelBox, frame, shipId));
  }
  syncs.get(shipPanelBox)!(frame);
  return context;
}

function buildShipPanel(shipPanelBox: HTMLElement, first: Frame, shipId: number): Sync {
  const single = first.list.rows.length === 1;
  const title = document.createElement("h2");
  const rows = document.createElement("dl");
  const statusCells = first.list.rows.map((row) => {
    const term = document.createElement("dt"); term.textContent = row.name;
    const detail = document.createElement("dd"); rows.append(term, detail);
    return detail;
  });
  const figures = single ? [...first.panel.rows, ...first.hangarRows] : [];
  const figureCells = figures.map(([label]) => {
    const term = document.createElement("dt"); term.textContent = label;
    const detail = document.createElement("dd"); detail.dataset.row = label;
    rows.append(term, detail);
    return detail;
  });
  const defaultSelect = document.createElement("select"); defaultSelect.name = "default";
  const homeSelect = document.createElement("select"); homeSelect.name = "ship-home";
  const routeFrom = document.createElement("select"); routeFrom.name = "haul-from";
  const routeTo = document.createElement("select"); routeTo.name = "haul-to";
  const routeMaterial = document.createElement("select"); routeMaterial.name = "haul-material";
  const routeLabels = [labelled("From ", routeFrom), labelled("To ", routeTo), labelled("Material ", routeMaterial)];
  const materialSelect = document.createElement("select"); materialSelect.name = "mine-material";
  const sectorsInput = document.createElement("input");
  sectorsInput.type = "checkbox"; sectorsInput.name = "mine-other-sectors";
  const sectorsLabel = document.createElement("label"); sectorsLabel.className = "mine-material";
  sectorsLabel.append(sectorsInput, " Mine in other sectors");
  const resume = document.createElement("button"); resume.textContent = "Resume"; resume.dataset.resume = "";
  const launch = single ? launchAllButton(first.state, shipId) : null;
  const thumbnail = single ? thumbnailElement(first.panel.design) : null;
  shipPanelBox.replaceChildren(title, rows, labelled("Home: ", homeSelect), defaultSelect, ...routeLabels,
    materialSelect, sectorsLabel, resume, ...(launch ? [launch] : []), ...(thumbnail ? [thumbnail] : []));

  return ({ state, panel, list, hangarRows }) => {
    setText(title, list.rows.length > 1 ? `${list.rows.length} ships selected` : `Ship ${panel.size}`);
    list.rows.forEach((row, index) => setText(statusCells[index]!, row.status));
    const values = [...panel.rows, ...hangarRows];
    figureCells.forEach((cell, index) => {
      const text = values[index]![1];
      setText(cell, text);
      if (cell.title !== text) cell.title = text;
    });

    syncSelect(defaultSelect, defaultOptions(list), list.defaultBehaviour);
    const defaultTitle = list.canHaul ? "" : (list.haulDisabledReason ?? "");
    if (defaultSelect.title !== defaultTitle) defaultSelect.title = defaultTitle;
    syncSelect(homeSelect, homeOptions(state, list.homeStation), list.homeStation === null ? "none" : String(list.homeStation));

    const route = list.haulRoute;
    const routed = route !== null && (list.defaultBehaviour === "haul" || list.defaultBehaviour === "mixed");
    for (const label of routeLabels) label.hidden = !routed;
    if (route && routed) {
      syncSelect(routeFrom, routeOptions(list.stations, route.from), route.from);
      syncSelect(routeTo, routeOptions(list.destinations, route.to), route.to);
      syncSelect(routeMaterial, routeOptions([{ id: "Metal", name: "Metal" }, { id: "Ice", name: "Ice" }], route.material), route.material);
    }

    materialSelect.hidden = list.materials === null;
    if (list.materials !== null) syncSelect(materialSelect, materialOptions(list), list.materials);
    sectorsLabel.hidden = list.mineOtherSectors === null;
    sectorsInput.checked = list.mineOtherSectors === "on";
    sectorsInput.indeterminate = list.mineOtherSectors === "mixed";

    resume.disabled = !list.canResume;
    if (launch) launch.disabled = launchAllDisabled(state, shipId);
  };
}

// Writes only a changed text, since rewriting a line every frame would clear any text the player has selected in it.
function setText(element: HTMLElement, text: string): void {
  if (element.textContent !== text) element.textContent = text;
}

function labelled(text: string, control: HTMLElement): HTMLElement {
  const wrap = document.createElement("label"); wrap.textContent = text;
  wrap.append(control);
  return wrap;
}

function defaultOptions(list: SelectionPanel): ControlOption[] {
  const options = BEHAVIOURS.map(([value, label]): ControlOption => value === "haul" && !list.canHaul
    ? { value, label, disabled: true, title: list.haulDisabledReason ?? "" }
    : { value, label });
  return list.defaultBehaviour === "mixed" ? [{ value: "mixed", label: "Default: Mixed" }, ...options] : options;
}

function materialOptions(list: SelectionPanel): ControlOption[] {
  const options: ControlOption[] = [
    { value: "both", label: "Metal and Ice" },
    { value: "Metal", label: "Metal" },
    { value: "Ice", label: "Ice" },
  ];
  return list.materials === "mixed" ? [{ value: "mixed", label: "Material: Mixed" }, ...options] : options;
}

function homeOptions(state: SimState, home: SelectionPanel["homeStation"]): ControlOption[] {
  const stations = state.stations.map((station) => ({ value: String(station.id), label: station.name }));
  return [...(home === "mixed" ? [{ value: "mixed", label: "Mixed" }] : []), { value: "none", label: "None" }, ...stations];
}

function routeOptions(entries: { id: string; name: string }[], value: string): ControlOption[] {
  const options = entries.map((entry) => ({ value: entry.id, label: entry.name }));
  return value === "mixed" ? [{ value: "mixed", label: "Mixed" }, ...options] : options;
}

function syncSelect(select: HTMLSelectElement, options: ControlOption[], value: string): void {
  // A dropdown the player has open keeps the option they have highlighted, so it is left alone until it closes.
  if (document.activeElement === select) return;
  const key = JSON.stringify(options);
  if (optionKeys.get(select) !== key) {
    optionKeys.set(select, key);
    select.replaceChildren(...options.map(optionElement));
  }
  select.value = value;
}

function optionElement(option: ControlOption): HTMLOptionElement {
  const element = document.createElement("option");
  element.value = option.value;
  element.textContent = option.label;
  element.disabled = option.disabled ?? false;
  element.title = option.title ?? "";
  return element;
}
