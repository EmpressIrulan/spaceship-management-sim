import type { Beam, Ship, SimState } from "sim";

// The repair link is a rendering cue for an active assignment, not a new
// simulation effect. Only draw it while its target still needs healing.
export function repairBeam(state: SimState, ship: Ship): Beam | null {
  if (!ship.design.slots.includes("Repair")) return null;
  const target = ship.repairTarget ?? (ship.repairTargetShipId == null ? null : { kind: "ship" as const, shipId: ship.repairTargetShipId });
  if (!target) return null;
  if (target.kind === "ship") {
    const damaged = state.ships.find((candidate) => candidate.id === target.shipId
      && candidate.id !== ship.id && candidate.sectorId === ship.sectorId
      && (candidate.hp ?? 40) < (candidate.maxHp ?? 40));
    return damaged ? { from: ship.position, to: damaged.position } : null;
  }
  const station = state.stations.find((candidate) => candidate.id === target.stationId && candidate.sectorId === ship.sectorId);
  const module = station?.modules.find((candidate) => candidate.position.x === target.position.x && candidate.position.y === target.position.y);
  const hp = module?.hp ?? module?.maxHp ?? 40;
  const maxHp = module?.maxHp ?? 40;
  return module && hp < maxHp ? { from: ship.position, to: module.position } : null;
}
