import { describe, expect, it } from "vitest";
import { DROP_SIZE, SIZE_MULTIPLIER, STARTING_SHIP, shipSize } from "./index";

describe("drop scale", () => {
  it("draws a pickup a third of its old size, following the size number", () => {
    expect(DROP_SIZE).toEqual({ width: 4 * SIZE_MULTIPLIER, height: 4 * SIZE_MULTIPLIER });
    expect(DROP_SIZE.width).toBeLessThan(shipSize(STARTING_SHIP).width);
  });
});
