import { describe, expect, it } from "vitest";
import { INITIAL_CLOCK, clockAfterButton, clockAfterKey, gameSeconds, speedButtons, type Clock } from "./speed";

const at = (speed: Clock["speed"], paused = false): Clock => ({ speed, paused });

describe("game clock", () => {
  it("starts running at 1x", () => {
    expect(INITIAL_CLOCK).toEqual({ speed: 1, paused: false });
    expect(gameSeconds(INITIAL_CLOCK, 0.5)).toBe(0.5);
  });

  it("scales real time by the speed", () => {
    expect(gameSeconds(at(2), 0.5)).toBe(1);
    expect(gameSeconds(at(4), 0.5)).toBe(2);
  });

  it("passes no game time while paused", () => {
    expect(gameSeconds(at(4, true), 0.5)).toBe(0);
  });
});

describe("keys", () => {
  it("picks 1x, 2x and 4x with 1, 2 and 3", () => {
    expect(clockAfterKey(at(1), "2")).toEqual(at(2));
    expect(clockAfterKey(at(1), "3")).toEqual(at(4));
    expect(clockAfterKey(at(4), "1")).toEqual(at(1));
  });

  it("pauses with space and goes back to the last speed", () => {
    const paused = clockAfterKey(at(4), " ");
    expect(paused).toEqual(at(4, true));
    expect(clockAfterKey(paused, " ")).toEqual(at(4));
  });

  it("ignores auto-repeat, so holding space pauses once", () => {
    const paused = clockAfterKey(at(2), " ");
    expect(clockAfterKey(paused, " ", true)).toBe(paused);
    expect(clockAfterKey(at(2), " ", true)).toEqual(at(2));
  });

  it("unpauses when a speed key is pressed while paused", () => {
    expect(clockAfterKey(at(1, true), "3")).toEqual(at(4));
  });

  it("leaves the clock alone for other keys", () => {
    const clock = at(2, true);
    expect(clockAfterKey(clock, "m")).toBe(clock);
    expect(clockAfterKey(clock, "4")).toBe(clock);
  });
});

describe("buttons", () => {
  it("lists Pause, 1x, 2x and 4x with only the running speed lit", () => {
    expect(speedButtons(at(2))).toEqual([
      { id: "pause", label: "Pause", active: false },
      { id: "1", label: "1x", active: false },
      { id: "2", label: "2x", active: true },
      { id: "4", label: "4x", active: false },
    ]);
  });

  it("lights only Pause while paused", () => {
    expect(speedButtons(at(4, true)).filter((button) => button.active).map((button) => button.id)).toEqual(["pause"]);
  });

  it("acts like the matching key", () => {
    expect(clockAfterButton(at(1), "4")).toEqual(at(4));
    expect(clockAfterButton(at(2), "pause")).toEqual(at(2, true));
    expect(clockAfterButton(at(2, true), "pause")).toEqual(at(2));
    expect(clockAfterButton(at(2, true), "1")).toEqual(at(1));
  });
});
