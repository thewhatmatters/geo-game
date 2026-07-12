import { describe, expect, it } from "vitest";
import { pathBounds, boundsToViewBox, viewBoxSize } from "./pathBounds";

describe("pathBounds", () => {
  it("computes the bounding box of a simple M/L/Z path", () => {
    expect(pathBounds("M10,20L30,20L30,50L10,50Z")).toEqual({ minX: 10, minY: 20, maxX: 30, maxY: 50 });
  });

  it("handles multiple subpaths (M...Z M...Z), e.g. an archipelago", () => {
    const path = "M0,0L10,0L10,10Z M100,100L120,100L120,120Z";
    expect(pathBounds(path)).toEqual({ minX: 0, minY: 0, maxX: 120, maxY: 120 });
  });

  it("handles negative coordinates", () => {
    expect(pathBounds("M-5.5,-10L5,10Z")).toEqual({ minX: -5.5, minY: -10, maxX: 5, maxY: 10 });
  });
});

describe("boundsToViewBox", () => {
  it("centers the viewBox on the bounds", () => {
    const box = boundsToViewBox({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, 0);
    const [x, y, w, h] = box.split(" ").map(Number);
    expect(x).toBe(0);
    expect(y).toBe(0);
    expect(w).toBe(100);
    expect(h).toBe(100);
  });

  it("expands by marginRatio relative to the larger dimension", () => {
    const box = boundsToViewBox({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, 0.5);
    const [, , w, h] = box.split(" ").map(Number);
    expect(w).toBe(200); // 100 * (1 + 0.5*2)
    expect(h).toBe(200);
  });

  it("is always square even for a non-square bounding box (uses the larger dimension)", () => {
    const box = boundsToViewBox({ minX: 0, minY: 0, maxX: 200, maxY: 50 }, 0);
    const [, , w, h] = box.split(" ").map(Number);
    expect(w).toBe(200);
    expect(h).toBe(200);
  });
});

describe("viewBoxSize", () => {
  it("extracts the width component of a viewBox string", () => {
    expect(viewBoxSize("-50 -50 100 100")).toBe(100);
  });
});
