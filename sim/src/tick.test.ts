import { describe, expect, it } from "vitest";
import { tick } from "./tick";
import { OUTBOUND_SECONDS, type SimState } from "./state";

describe("tick", () => {
  it("moves a ship from outbound to working once its travel timer expires", () => {
    const state: SimState = {
      tickCount: 0,
      ships: [{ state: "outbound", timer: OUTBOUND_SECONDS }],
    };

    const next = tick(state, OUTBOUND_SECONDS);

    expect(next.ships[0]?.state).toBe("working");
  });
});
