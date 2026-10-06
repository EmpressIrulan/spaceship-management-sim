import { describe, expect, it } from "vitest";
import { createInitialState } from "./src/state";
import { foundedStation } from "./src/test-ships";
import { placeStation } from "./src/station-placement";
import { tick } from "./src/tick";
import { cargoTransferSeconds } from "./src/ship";

it("dbg", () => {
  const base = createInitialState(7);
  const start = {
    ...base,
    stations: [base.stations[0]!, foundedStation(1, 1, 120, 40, { Metal: 0, Ice: 0 })],
    ships: [{ ...base.ships[0]!, sectorId: 1, position: { x: 100, y: 40 },
      state: "haulUnloading" as const, timer: cargoTransferSeconds(20), cargo: 20, cargoMaterial: "Ice" as const,
      transfer: { startingCargo: 20, amount: 20 },
      cargoByMaterial: { Metal: 6, Ice: 14 }, haulRoute: { from: "home" as const, to: "station:1" as const, material: "Ice" as const } }],
  };
  expect(start.ships[0]!.haulRoute).toEqual({ from: "home", to: "station:1", material: "Ice" });
  const half = tick(start, 3.01);
  console.log("half cargo", half.ships[0]!.cargo, "station1 inv", half.stations[1]!.inventory);
  const done = tick(start, cargoTransferSeconds(20));
  console.log("done ship", done.ships[0]!.cargo, done.ships[0]!.state, "inv", done.stations[1]!.inventory);
  expect(true).toBe(true);
});
