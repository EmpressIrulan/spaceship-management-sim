import { SHIP_MODULES, queueShipBuild, cancelShipBuild, stationById, type SimState, type Vec } from "sim";
import { panBy, wheelZoomFactor, type Viewport } from "./camera";
import { menuButton as button, renderBlueprints } from "./menu-rendering";
import { slotColor } from "./ships";
import {
  BRUSH_SIZES,
  applyTool,
  cellAt,
  designOf,
  emptyDraft,
  emptyView,
  lineCells,
  zoomView,
  withModule,
  withSize,
  withTool,
  shouldDismissShipMenuOnMouseDown,
  type ShipDraft,
  buildCountFor,
  changeBuildCount,
  builderIndexAt,
} from "./shipyard";
import {
  deleteBlueprint,
  draftFromDesign,
  saveBlueprint,
  viewCentredOn,
  type Blueprint,
  resolveBlueprintStore,
} from "./blueprints";
import type { UiState } from "./ui-state";

export interface ShipMenuSystem {
  openShipMenu: (builder: number, stationId?: number) => void;
  closeShipMenu: () => void;
  paintPointAt: (client: Vec) => Vec;
  paintViewport: () => Viewport;
}
export function installShipMenu(
  ui: UiState,
  getState: () => SimState,
  setState: (state: SimState) => void,
  shipMenu: HTMLElement,
  shipPanelBox: HTMLElement,
  blueprintStore: ReturnType<typeof resolveBlueprintStore>,
): ShipMenuSystem {
  window.addEventListener(
    "mousedown",
    (event) => {
      if (
        shouldDismissShipMenuOnMouseDown(
          ui.shipMenuBuilder !== null,
          shipMenu.contains(event.target as Node | null),
        )
      )
        closeShipMenu();
    },
    true,
  );
  const TOOL_BUTTONS = [
    ["erase", "Eraser"],
    ["fill", "Fill"],
  ] as const;

  // Built once when the menu opens. The buttons only change which one is
  // pressed afterwards, so the paint canvas and its listeners stay put. The
  // stats, cost and Build button are refreshed every frame in draw(), since
  // Storage keeps changing underneath.
  function renderShipMenu(): void {
    const title = document.createElement("h2");
    title.textContent = "Build ship";
    const modules = document.createElement("div");
    modules.className = "row";
    for (const module of SHIP_MODULES) {
      const pick = button(module, { module });
      pick.style.borderLeft = `6px solid ${slotColor(module)}`;
      modules.append(pick);
    }
    const tools = document.createElement("div");
    tools.className = "row";
    for (const size of BRUSH_SIZES)
      tools.append(button(`${size} px`, { size: String(size) }));
    for (const [tool, label] of TOOL_BUTTONS)
      tools.append(button(label, { tool }));
    ui.paintCanvas = document.createElement("canvas");
    ui.paintCanvas.className = "paint";
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent =
      "Drag to paint. Right-drag or middle-drag to pan, scroll to zoom.";
    const stats = document.createElement("div");
    stats.className = "stats";
    const cost = document.createElement("div");
    cost.className = "cost";
    const save = document.createElement("div");
    save.className = "row blueprint-save";
    const blueprintName = document.createElement("input");
    blueprintName.className = "blueprint-name";
    blueprintName.placeholder = "Blueprint name";
    blueprintName.setAttribute("aria-label", "Blueprint name");
    const saveBlueprintButton = button("Save blueprint", { blueprintSave: "" });
    saveBlueprintButton.disabled = true;
    save.append(blueprintName, saveBlueprintButton);
    const blueprintList = document.createElement("div");
    blueprintList.className = "blueprints";
    const build = button("Build", { build: "" });
    build.textContent = "Queue";
    build.dataset.build = "";
    build.className = "build";
    const count = document.createElement("div");
    count.className = "row build-count";
    count.append(button("−", { count: "-" }));
    const countValue = document.createElement("span");
    countValue.className = "count-value";
    count.append(countValue, button("+", { count: "+" }));
    const queue = document.createElement("div");
    queue.className = "ship-build-queue";
    shipMenu.replaceChildren(
      title,
      modules,
      tools,
      ui.paintCanvas,
      hint,
      stats,
      cost,
      save,
      blueprintList,
      count,
      build,
      queue,
    );
    renderBlueprints(shipMenu, ui.blueprints);
    syncShipMenuButtons();
  }

  function syncShipMenuButtons(): void {
    for (const element of shipMenu.querySelectorAll<HTMLButtonElement>(
      "button[data-module]",
    )) {
      element.classList.toggle(
        "pressed",
        ui.draft.tool === "paint" && ui.draft.module === element.dataset.module,
      );
    }
    for (const element of shipMenu.querySelectorAll<HTMLButtonElement>(
      "button[data-size]",
    )) {
      element.classList.toggle(
        "pressed",
        ui.draft.tool !== "fill" &&
          ui.draft.size === Number(element.dataset.size),
      );
    }
    for (const element of shipMenu.querySelectorAll<HTMLButtonElement>(
      "button[data-tool]",
    )) {
      element.classList.toggle(
        "pressed",
        ui.draft.tool === element.dataset.tool,
      );
    }
  }

  function openShipMenu(builder: number, stationId = 0): void {
    const module = stationById(getState(), stationId)?.modules[builder];
    if (module?.type !== "Builder") return;
    ui.shipMenuBuilder = builder;
    ui.shipMenuPosition = { ...module.position };
    ui.shipMenuStation = stationId;
    ui.shipMenuCounts.clear();
    ui.draft = emptyDraft();
    ui.paintView = emptyView();
    renderShipMenu();
    shipMenu.hidden = false;
  }

  function closeShipMenu(): void {
    ui.shipMenuBuilder = null;
    ui.shipMenuPosition = null;
    shipMenu.hidden = true;
    ui.stroking = null;
    ui.paintPan = null;
    ui.partHover = null;
  }

  shipMenu.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "button",
    );
    if (!target || target.disabled || ui.shipMenuBuilder === null) return;
    ui.shipMenuBuilder = builderIndexAt(getState(), ui.shipMenuStation, ui.shipMenuPosition);
    if (ui.shipMenuBuilder === null) {
      closeShipMenu();
      return;
    }
    const data = target.dataset;
    if (data.module)
      ui.draft = withModule(
        withTool(ui.draft, "paint"),
        data.module as ShipDraft["module"],
      );
    else if (data.size)
      ui.draft = withSize(
        ui.draft.tool === "fill" ? withTool(ui.draft, "paint") : ui.draft,
        Number(data.size) as ShipDraft["size"],
      );
    else if (data.tool)
      ui.draft = withTool(ui.draft, data.tool as ShipDraft["tool"]);
    else if (data.count) changeBuildCount(ui.shipMenuCounts, designOf(ui.draft), data.count === "+" ? 1 : -1);
    else if (data.blueprintSave !== undefined) {
      const input =
        shipMenu.querySelector<HTMLInputElement>(".blueprint-name")!;
      ui.blueprints = saveBlueprint(
        blueprintStore,
        input.value,
        designOf(ui.draft),
      );
      input.value = "";
      target.disabled = true;
      renderBlueprints(shipMenu, ui.blueprints);
    } else if (data.blueprintLoad !== undefined) {
      const blueprint = ui.blueprints[Number(data.blueprintLoad)];
      if (!blueprint) return;
      ui.draft = draftFromDesign(ui.draft, blueprint.design);
      ui.paintView = viewCentredOn(ui.paintView, blueprint.design);
    } else if (data.blueprintDelete !== undefined) {
      const blueprint = ui.blueprints[Number(data.blueprintDelete)];
      if (!blueprint) return;
      ui.blueprints = deleteBlueprint(blueprintStore, blueprint.name);
      renderBlueprints(shipMenu, ui.blueprints);
    } else if (data.build !== undefined) {
      setState(queueShipBuild(getState(), ui.shipMenuBuilder, designOf(ui.draft), buildCountFor(ui.shipMenuCounts, designOf(ui.draft)), ui.shipMenuStation));
    } else if (data.cancelBuild !== undefined) {
      setState(cancelShipBuild(getState(), ui.shipMenuBuilder, Number(data.cancelBuild), ui.shipMenuStation));
    }
    syncShipMenuButtons();
    shipMenu.querySelector<HTMLElement>(".count-value")!.textContent = String(buildCountFor(ui.shipMenuCounts, designOf(ui.draft)));
  });

  shipMenu.addEventListener("input", (event) => {
    const input = (event.target as HTMLElement).closest<HTMLInputElement>(
      ".blueprint-name",
    );
    if (!input) return;
    const save = shipMenu.querySelector<HTMLButtonElement>(
      "button[data-blueprint-save]",
    )!;
    save.disabled = input.value.trim() === "" || designOf(ui.draft).width === 0;
  });

  function paintPointAt(client: Vec): Vec {
    const bounds = ui.paintCanvas!.getBoundingClientRect();
    return {
      x: (client.x - bounds.left) * (ui.paintCanvas!.width / bounds.width),
      y: (client.y - bounds.top) * (ui.paintCanvas!.height / bounds.height),
    };
  }

  function paintPoint(event: MouseEvent): Vec {
    return paintPointAt({ x: event.clientX, y: event.clientY });
  }

  function paintViewport(): Viewport {
    return { width: ui.paintCanvas!.width, height: ui.paintCanvas!.height };
  }

  shipMenu.addEventListener("mousedown", (event) => {
    if (event.target !== ui.paintCanvas) return;
    event.preventDefault();
    const point = paintPoint(event);
    if (event.button === 0) {
      const cell = cellAt(ui.paintView, paintViewport(), point);
      applyTool(ui.draft, cell);
      ui.stroking = cell;
    } else if (event.button === 1 || event.button === 2) ui.paintPan = point;
  });
  shipMenu.addEventListener("contextmenu", (event) => {
    if (event.target === ui.paintCanvas) event.preventDefault();
  });
  shipMenu.addEventListener(
    "wheel",
    (event) => {
      if (event.target !== ui.paintCanvas) return;
      event.preventDefault();
      ui.paintView = zoomView(
        ui.paintView,
        paintViewport(),
        paintPoint(event),
        wheelZoomFactor(event.deltaY),
      );
    },
    { passive: false },
  );
  shipMenu.addEventListener("mousemove", (event) => {
    ui.paintPointer =
      event.target === ui.paintCanvas ? paintPoint(event) : null;
    ui.partHover = ui.paintPointer
      ? { at: { x: event.clientX, y: event.clientY }, source: "paint" }
      : null;
  });
  shipMenu.addEventListener("mouseleave", () => {
    ui.paintPointer = null;
    ui.partHover = null;
  });
  shipPanelBox.addEventListener("mousemove", (event) => {
    const onThumb =
      (event.target as HTMLElement).closest(".ship-thumb") !== null;
    ui.partHover = onThumb
      ? { at: { x: event.clientX, y: event.clientY }, source: "thumb" }
      : null;
  });
  shipPanelBox.addEventListener("mouseleave", () => {
    ui.partHover = null;
  });
  window.addEventListener("mousemove", (event) => {
    if (!ui.paintCanvas || ui.shipMenuBuilder === null) return;
    const point = paintPoint(event);
    if (ui.paintPan) {
      ui.paintView = panBy(
        ui.paintView,
        point.x - ui.paintPan.x,
        point.y - ui.paintPan.y,
      );
      ui.paintPan = point;
    }
    // Fill is a single click, so dragging with it does nothing more.
    if (ui.stroking && ui.draft.tool !== "fill") {
      const cell = cellAt(ui.paintView, paintViewport(), point);
      for (const step of lineCells(ui.stroking, cell))
        applyTool(ui.draft, step);
      ui.stroking = cell;
    }
  });
  window.addEventListener("mouseup", () => {
    ui.stroking = null;
    ui.paintPan = null;
  });

  return { openShipMenu, closeShipMenu, paintPointAt, paintViewport };
}
