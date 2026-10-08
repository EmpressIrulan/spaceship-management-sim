import { describe, expect, it, vi } from "vitest";
import { createUiState } from "./ui-state";
import { openClaimNaming } from "./claim-naming";

describe("a finished Claim opens the name box", () => {
  it("opens the map and starts the rename of the sector that finished", () => {
    const ui = createUiState([]);
    const startRename = vi.fn();

    openClaimNaming(ui, [3], startRename);

    expect(ui.mapOpen).toBe(true);
    expect(startRename).toHaveBeenCalledWith(3);
  });

  it("does nothing when no Claim finished this tick", () => {
    const ui = createUiState([]);
    const startRename = vi.fn();

    openClaimNaming(ui, [], startRename);

    expect(ui.mapOpen).toBe(false);
    expect(startRename).not.toHaveBeenCalled();
  });
});
