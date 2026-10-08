import { createInitialState, tick, setMineMaterial, type SimState } from "sim";

declare global { interface Window { shipMenuDemo: { start(): void; advance(): void; resetMining(): void; openDefault(): void; stop(): void; snapshot(): unknown } } }
export function installShipMenuDemo(ui: any, getState: () => SimState, setState: (s: SimState) => void, menu: { closeShipMenu(): void }): void {
  let cycleCount = 0;
  let previous = "";
  const states: string[] = [];
  const mining = (): void => {
    let s = createInitialState(127);
    s = setMineMaterial(s, [0], "Metal", true);
    setState(s);
    cycleCount = 0; previous = ""; states.length = 0;
    ui.selectedShips = [0]; ui.selectedShip = 0; ui.currentSector = 0;
    menu.closeShipMenu();
  };
  const advance = (): void => {
    const s = getState();
    const next = tick(s, 1);
    const current = next.ships[0]?.state ?? "";
    if (current !== states.at(-1)) states.push(current);
    if (previous === "unloading" && current !== "unloading") cycleCount++;
    previous = current;
    setState(next);
  };
  window.shipMenuDemo = {
    start: mining, advance, resetMining: mining, openDefault() {}, stop() {},
    snapshot: () => ({ ship: getState().ships[0], deliveries: getState().stations[0]?.deliveries.length, cycleCount, states: [...states] }),
  };
  // Drive one deterministic simulation second per rendered frame; browser timing is not used to infer state.
  const drive = (): void => { if (ui.selectedShips.includes(0) && (window.shipMenuDemo as any).running) advance(); requestAnimationFrame(drive); };
  (window.shipMenuDemo as any).running = false;
  const start = window.shipMenuDemo.start;
  window.shipMenuDemo.start = () => { start(); (window.shipMenuDemo as any).running = true; };
  const reset = window.shipMenuDemo.resetMining;
  window.shipMenuDemo.resetMining = () => { reset(); (window.shipMenuDemo as any).running = true; };
  window.shipMenuDemo.stop = () => { (window.shipMenuDemo as any).running = false; };
  requestAnimationFrame(drive);
}
