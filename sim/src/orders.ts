import {
  SHIP_SIZE,
  depart,
  flyTo,
  miningSite,
  nearestWithOre,
  type Asteroid,
  type DefaultBehaviour,
  type Ship,
  type SimState,
  type Vec,
} from "./state";

// What the player right-clicked. A mine order's progress is tracked on the
// ship, so it is not part of what the player gives.
export type OrderTarget =
  | { kind: "mine"; asteroidId: number }
  | { kind: "move"; point: Vec }
  | { kind: "home" };

// Two ship lengths between neighbours, so hulls and cargo gauges stay apart.
const FORMATION_SPACING = 2 * SHIP_SIZE.width;

// Spots for `count` ships around a point: the point itself, then rings of 6,
// 12, 18... further out.
export function formation(point: Vec, count: number): Vec[] {
  const spots: Vec[] = [];
  for (let ring = 0; spots.length < count; ring += 1) {
    const slots = Math.max(1, 6 * ring);
    for (let slot = 0; slot < slots && spots.length < count; slot += 1) {
      const angle = (slot / slots) * 2 * Math.PI;
      spots.push({
        x: point.x + Math.cos(angle) * ring * FORMATION_SPACING,
        y: point.y + Math.sin(angle) * ring * FORMATION_SPACING,
      });
    }
  }
  return spots;
}

function hold(ship: Ship): Ship {
  return { ...ship, state: "holding", leg: null, timer: 0 };
}

// Where a ship with no order goes next. `ship` may be anywhere, not only at
// the Dock, since a player can resume it from the middle of the map.
function toDefault(ship: Ship, dock: Vec, asteroids: Asteroid[]): Ship {
  if (ship.defaultBehaviour === "none") return hold(ship);
  const atDock = ship.position.x === dock.x && ship.position.y === dock.y;
  if (atDock && ship.cargo === 0) return depart(ship, dock, asteroids);
  const asteroid = nearestWithOre(dock, asteroids);
  if (ship.cargo > 0 || !asteroid) return flyTo({ ...ship, target: null }, "homebound", dock);
  const site = miningSite(dock, asteroid);
  return flyTo(
    { ...ship, cargoMaterial: asteroid.material, target: { asteroidId: asteroid.id, site } },
    "outbound",
    site,
  );
}

// Called when a ship has emptied its hold at the Dock. A mine order that sent
// the ship home to drop a different material still has its rock to visit.
export function afterOrder(ship: Ship, dock: Vec, asteroids: Asteroid[]): Ship {
  const order = ship.order;
  if (order?.kind === "mine" && !order.loaded) {
    const asteroid = asteroids.find((a) => a.id === order.asteroidId);
    if (asteroid) return toRock(ship, asteroid, miningSite(dock, asteroid));
  }
  return toDefault({ ...ship, order: null }, dock, asteroids);
}

function toRock(ship: Ship, asteroid: Asteroid, site: Vec): Ship {
  return flyTo(
    {
      ...ship,
      cargoMaterial: asteroid.material,
      target: { asteroidId: asteroid.id, site },
      order: { kind: "mine", asteroidId: asteroid.id, loaded: false },
    },
    "outbound",
    site,
  );
}

function apply(ship: Ship, target: OrderTarget, spot: Vec, state: SimState): Ship {
  const dock = state.station.dock.position;
  if (target.kind === "move") {
    return flyTo({ ...ship, target: null, order: { kind: "move", point: { ...target.point } } }, "moving", spot);
  }
  if (target.kind === "home") {
    return flyTo({ ...ship, target: null, order: { kind: "home" } }, "homebound", dock);
  }
  const asteroid = state.asteroids.find((a) => a.id === target.asteroidId)!;
  // A hold carries one material, so a different one goes home first.
  if (ship.cargo > 0 && ship.cargoMaterial !== asteroid.material) {
    return flyTo(
      { ...ship, target: null, order: { kind: "mine", asteroidId: asteroid.id, loaded: false } },
      "homebound",
      dock,
    );
  }
  return toRock(ship, asteroid, spot);
}

// Interrupts whatever the listed ships are doing. Cargo stays aboard.
export function giveOrder(state: SimState, shipIndices: number[], target: OrderTarget): SimState {
  let point: Vec;
  if (target.kind === "move") {
    point = target.point;
  } else if (target.kind === "home") {
    point = state.station.dock.position;
  } else {
    const asteroid = state.asteroids.find((a) => a.id === target.asteroidId);
    if (!asteroid) return state;
    point = miningSite(state.station.dock.position, asteroid);
  }
  const spots = formation(point, shipIndices.length);
  return {
    ...state,
    ships: state.ships.map((ship, index) => {
      const slot = shipIndices.indexOf(index);
      return slot < 0 ? ship : apply(ship, target, spots[slot]!, state);
    }),
  };
}

// Drops the listed ships' orders and sends them back to their default.
// Ships without an order carry on as they are.
export function resumeDefault(state: SimState, shipIndices: number[]): SimState {
  const dock = state.station.dock.position;
  return {
    ...state,
    ships: state.ships.map((ship, index) =>
      shipIndices.includes(index) && ship.order
        ? toDefault({ ...ship, order: null }, dock, state.asteroids)
        : ship,
    ),
  };
}

// A ship mid-trip finishes it first. One holding with nothing to do starts on
// the new default straight away.
export function setDefaultBehaviour(
  state: SimState,
  shipIndices: number[],
  behaviour: DefaultBehaviour,
): SimState {
  const dock = state.station.dock.position;
  return {
    ...state,
    ships: state.ships.map((ship, index) => {
      if (!shipIndices.includes(index)) return ship;
      const next = { ...ship, defaultBehaviour: behaviour };
      return next.state === "holding" && !next.order ? toDefault(next, dock, state.asteroids) : next;
    }),
  };
}
