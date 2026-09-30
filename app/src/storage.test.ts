import { describe, expect, it } from "vitest";
import { createInitialState, setStorageLimit } from "sim";
import { deleteButtonAction, storagePanelOpenAfterClick, storagePanelRows } from "./storage";

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

  it("opens for a Storage click, closes for empty space and otherwise stays as it was", () => {
    expect(storagePanelOpenAfterClick(false, "storage")).toBe(true);
    expect(storagePanelOpenAfterClick(true, "empty")).toBe(false);
    expect(storagePanelOpenAfterClick(true, "other")).toBe(true);
  });

  it("does not ask for confirmation when Delete has no amount", () => {
    expect(deleteButtonAction(null, "Metal", "", 1_000)).toEqual({ confirmation: null, deleteAmount: null });
  });

  it("deletes the confirmed amount even if the box changes before the second click", () => {
    const first = deleteButtonAction(null, "Metal", "30", 1_000);
    expect(first).toEqual({
      confirmation: { material: "Metal", amount: 30, until: 4_000 },
      deleteAmount: null,
    });

    expect(deleteButtonAction(first.confirmation, "Metal", "5", 3_999)).toEqual({
      confirmation: null,
      deleteAmount: 30,
    });
  });

  it("starts a fresh confirmation after the old one expires", () => {
    const expired = { material: "Metal" as const, amount: 30, until: 4_000 };
    expect(deleteButtonAction(expired, "Metal", "5", 4_001)).toEqual({
      confirmation: { material: "Metal", amount: 5, until: 7_001 },
      deleteAmount: null,
    });
  });
});
