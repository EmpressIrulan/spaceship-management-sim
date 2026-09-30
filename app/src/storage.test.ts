import { describe, expect, it } from "vitest";
import { createInitialState, setStorageLimit } from "sim";
import { deleteButtonAction, storagePanelRows } from "./storage";

describe("Storage panel", () => {
  it("lists every material with its amount and a blank unlimited limit", () => {
    expect(storagePanelRows(createInitialState(7))).toEqual([
      { material: "Metal", amount: 20, limit: "" },
      { material: "Ice", amount: 20, limit: "" },
    ]);
  });

  it("shows a set material limit", () => {
    const limited = setStorageLimit(createInitialState(7), "Ice", 40);
    expect(storagePanelRows(limited)[1]).toEqual({ material: "Ice", amount: 20, limit: "40" });
  });

  it("requires a second delete click within a few seconds", () => {
    expect(deleteButtonAction(null, 1_000)).toEqual({ confirmUntil: 4_000, deleteNow: false });
    expect(deleteButtonAction(4_000, 3_999)).toEqual({ confirmUntil: null, deleteNow: true });
    expect(deleteButtonAction(4_000, 4_001)).toEqual({ confirmUntil: 7_001, deleteNow: false });
  });
});
