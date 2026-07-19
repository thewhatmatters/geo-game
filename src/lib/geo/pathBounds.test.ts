import { describe, expect, it } from "vitest";
import { pathBounds, subpathBounds, boundsToViewBox, viewBoxSize, visiblePointsBounds } from "./pathBounds";

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

describe("subpathBounds", () => {
  it("returns one bounds per M...Z subpath, in order", () => {
    const path = "M0,0L10,0L10,10ZM100,100L120,100L120,120Z";
    expect(subpathBounds(path)).toEqual([
      { minX: 0, minY: 0, maxX: 10, maxY: 10 },
      { minX: 100, minY: 100, maxX: 120, maxY: 120 },
    ]);
  });

  it("returns a single bounds for a single-ring path, matching pathBounds", () => {
    const path = "M10,20L30,20L30,50L10,50Z";
    expect(subpathBounds(path)).toEqual([pathBounds(path)]);
  });

  it("handles negative coordinates within subpaths", () => {
    expect(subpathBounds("M-5.5,-10L5,10ZM20,20L25,25Z")).toEqual([
      { minX: -5.5, minY: -10, maxX: 5, maxY: 10 },
      { minX: 20, minY: 20, maxX: 25, maxY: 25 },
    ]);
  });
});

describe("visiblePointsBounds", () => {
  const container = { minX: 0, minY: 0, maxX: 100, maxY: 100 };

  it("bounds only the vertices inside the container, ignoring out-of-frame ones", () => {
    // A shape mostly outside the frame: only (10,10) and (90,20) are in.
    const path = "M10,10L90,20L500,20L500,300L10,300Z";
    expect(visiblePointsBounds(path, container)).toEqual({ minX: 10, minY: 10, maxX: 90, maxY: 20 });
  });

  it("does NOT degenerate to the container for a shape whose bbox contains it (wrap-around neighbor)", () => {
    // Ring surrounding the container with one edge dipping inside — the
    // bbox clip would return the whole container; the vertex bounds trace
    // just the visible dip.
    const path = "M-50,-50L150,-50L150,150L50,80L-50,150Z";
    expect(visiblePointsBounds(path, container)).toEqual({ minX: 50, minY: 80, maxX: 50, maxY: 80 });
  });

  it("returns null when no vertex lies inside the container", () => {
    expect(visiblePointsBounds("M200,200L300,200L300,300Z", container)).toBeNull();
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
