import {
  HOMEBOUND_SECONDS,
  OUTBOUND_SECONDS,
  WORKING_SECONDS,
  type Ship,
  type SimState,
} from "./state";

function nextShipState(ship: Ship, dt: number): Ship {
  const timer = ship.timer - dt;
  if (timer > 0) {
    return { ...ship, timer };
  }
  switch (ship.state) {
    case "outbound":
      return { state: "working", timer: WORKING_SECONDS };
    case "working":
      return { state: "homebound", timer: HOMEBOUND_SECONDS };
    case "homebound":
      return { state: "outbound", timer: OUTBOUND_SECONDS };
  }
}

export function tick(state: SimState, dt: number): SimState {
  return {
    tickCount: state.tickCount + 1,
    ships: state.ships.map((ship) => nextShipState(ship, dt)),
  };
}
