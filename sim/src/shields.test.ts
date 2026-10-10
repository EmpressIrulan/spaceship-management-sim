import { describe, expect, it } from "vitest";
import { SHIELD_RECHARGE_DELAY, SHIELD_RECHARGE_PER_PIXEL } from "./build-constants";
import { damageShip } from "./shields";
import { miningStart } from "./test-ships";
import { tick } from "./tick";
import type { ShipDesign } from "./model";

const SHIP: ShipDesign = { width: 3, height: 1, slots: ["Capacitor", "Generator", "Hull"] };

function ship() {
  return { ...miningStart(7).ships[0]!, design: SHIP, shield: 20, maxShield: 20, hp: 40, maxHp: 40 };
}

describe("ship shield damage", () => {
  it("soaks a hit before hull and carries leftover damage into hull", () => {
    const damaged = damageShip({ ...ship(), shield: 5 }, 8, 12);
    expect(damaged).toMatchObject({ shield: 0, hp: 37, shieldLastHit: 12 });
  });

  it("does not record a shield hit when the shield is already empty", () => {
    const damaged = damageShip({ ...ship(), shield: 0, shieldLastHit: undefined }, 3, 12);
    expect(damaged).toMatchObject({ shield: 0, hp: 37 });
    expect(damaged?.shieldLastHit).toBeUndefined();
  });
});

describe("ship shield recharge", () => {
  it("waits five seconds after a hit, then refills at the generator rate", () => {
    let state = miningStart(7);
    const shielded = { ...state.ships[0]!, design: SHIP, state: "holding" as const, timer: 0,
      shield: 0, maxShield: 20, shieldLastHit: 0 };
    state = { ...state, ships: [shielded] };
    state = tick(state, SHIELD_RECHARGE_DELAY - 0.1);
    expect(state.ships[0]!.shield).toBe(0);
    state = tick(state, 0.1);
    expect(state.ships[0]!.shield).toBe(0);
    state = tick(state, 2);
    expect(state.ships[0]!.shield).toBe(2 * SHIELD_RECHARGE_PER_PIXEL);
    state = tick(state, 18);
    expect(state.ships[0]!.shield).toBe(20);
  });

  it("restarts the delay when a hit lands during recharge", () => {
    let state = miningStart(7);
    const shielded = { ...state.ships[0]!, design: SHIP, state: "holding" as const, timer: 0,
      shield: 0, maxShield: 20, shieldLastHit: 0 };
    state = { ...state, ships: [shielded] };
    state = tick(state, SHIELD_RECHARGE_DELAY + 1);
    const hit = damageShip(state.ships[0]!, 2, state.time);
    expect(hit).toMatchObject({ shield: 0, hp: 39, shieldLastHit: state.time });
    state = { ...state, ships: hit ? [hit] : [] };
    state = tick(state, SHIELD_RECHARGE_DELAY - 0.1);
    expect(state.ships[0]!.shield).toBe(0);
  });
});
