import { describe, expect, it } from "vitest";
import { pointerAfterCanvasLeave } from "./camera-input";
import type { Vec } from "sim";

describe("canvas pointer leave over build controls", () => {
  const pointer: Vec = { x: 692, y: 398 };
  const button = {} as Node;
  const controls = { contains: (target: Node | null) => target === button } as HTMLElement;

  it("keeps the pointer when it moves from the canvas onto a build control", () => {
    expect(pointerAfterCanvasLeave(pointer, controls, button)).toEqual(pointer);
  });

  it("clears the pointer when it leaves the canvas for anywhere else", () => {
    expect(pointerAfterCanvasLeave(pointer, controls, null)).toBeNull();
    expect(pointerAfterCanvasLeave(pointer, controls, {} as Node)).toBeNull();
  });
});
