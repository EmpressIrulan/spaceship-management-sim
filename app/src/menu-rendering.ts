import { speedButtons, type Clock, type SpeedButtonId } from "./speed";
import type { Blueprint } from "./blueprints";

export function renderSpeedControls(container: HTMLElement, clock: Clock): void {
  const buttons = speedButtons(clock);
  if (container.children.length !== buttons.length) {
    container.replaceChildren(...buttons.map((item) => {
      const element = document.createElement("button");
      element.dataset.speed = item.id;
      element.textContent = item.label;
      return element;
    }));
  }
  buttons.forEach((item, index) => {
    const element = container.children[index] as HTMLButtonElement;
    element.classList.toggle("active", item.active);
    element.setAttribute("aria-pressed", String(item.active));
  });
}

export function menuButton(text: string, data: Record<string, string>, pressed = false): HTMLButtonElement {
  const element = document.createElement("button");
  element.textContent = text;
  Object.assign(element.dataset, data);
  if (pressed) element.classList.add("pressed");
  return element;
}

export function renderBlueprints(menu: HTMLElement, blueprints: Blueprint[]): void {
  const list = menu.querySelector<HTMLElement>(".blueprints")!;
  if (blueprints.length === 0) {
    const empty = document.createElement("span");
    empty.className = "hint";
    empty.textContent = "No saved blueprints";
    list.replaceChildren(empty);
    return;
  }
  list.replaceChildren(...blueprints.map((blueprint, index) => {
    const row = document.createElement("div");
    row.className = "blueprint";
    const name = document.createElement("span");
    name.textContent = blueprint.name;
    const actions = document.createElement("span");
    actions.className = "row";
    actions.append(
      menuButton("Load", { blueprintLoad: String(index) }),
      menuButton("Delete", { blueprintDelete: String(index) }),
    );
    row.append(name, actions);
    return row;
  }));
}

export type { SpeedButtonId };
