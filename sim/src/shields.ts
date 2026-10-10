import { SHIELD_RECHARGE_DELAY } from "./build-constants";
import { shipHp, shipShield } from "./ship";
import type { Ship } from "./model";

// Applies one hit to the shield and then to the hull. Null means the ship was
// destroyed. Recharge follows all hits; the ring follows only absorbed damage.
export function damageShip(ship: Ship, damage: number, hitAt: number): Ship | null {
  const { hp, maxHp } = shipHp(ship);
  const { shield, maxShield } = shipShield(ship);
  const shieldDamage = Math.min(shield, damage);
  const hullDamage = damage - shieldDamage;
  const nextShield = shield - shieldDamage;
  const nextHp = hp - hullDamage;
  if (nextHp <= 0) return null;
  return {
    ...ship,
    hp: nextHp,
    maxHp,
    shield: nextShield,
    maxShield,
    shieldLastHit: maxShield > 0 ? hitAt : ship.shieldLastHit,
    shieldLastAbsorbedHit: shieldDamage > 0 ? hitAt : ship.shieldLastAbsorbedHit,
  };
}

export function advanceShields(ships: Ship[], from: number, to: number): Ship[] {
  return ships.map((ship) => {
    const { shield, maxShield, recharge } = shipShield(ship);
    if (ship.shieldLastHit === undefined || maxShield <= shield || recharge <= 0) return ship;
    const eligibleFrom = Math.max(from, ship.shieldLastHit + SHIELD_RECHARGE_DELAY);
    const added = Math.max(0, to - eligibleFrom) * recharge;
    if (added <= 0) return ship;
    return { ...ship, shield: Math.min(maxShield, shield + added), maxShield };
  });
}

export function nextShieldEvent(ships: Ship[], now: number): number {
  let soonest = Infinity;
  for (const ship of ships) {
    const { shield, maxShield, recharge } = shipShield(ship);
    if (ship.shieldLastHit === undefined || shield >= maxShield || recharge <= 0) continue;
    const starts = ship.shieldLastHit + SHIELD_RECHARGE_DELAY;
    const wait = now < starts ? starts - now : (maxShield - shield) / recharge;
    soonest = Math.min(soonest, wait);
  }
  return soonest;
}
