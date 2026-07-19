import { describe, expect, it } from "vitest";
import { applyZoomDelta, zoomStepsCrossed, ZOOM_MIN, ZOOM_STEP } from "./zoom";

// Far beyond what the small test deltas below reach — isolates ordinary
// movement from zoomMax clamping, which gets its own dedicated describe
// block using a deliberately small zoomMax.
const TEST_ZOOM_MAX = 100;

describe("applyZoomDelta", () => {
  it("clamps at ZOOM_MIN when zooming in past the default", () => {
    const result = applyZoomDelta(ZOOM_MIN, -1000, ZOOM_MIN, TEST_ZOOM_MAX);
    expect(result.zoom).toBe(ZOOM_MIN);
  });

  it("clamps at zoomMax when zooming out past the limit", () => {
    const result = applyZoomDelta(ZOOM_MIN, 1_000_000, ZOOM_MIN, TEST_ZOOM_MAX);
    expect(result.zoom).toBe(TEST_ZOOM_MAX);
    expect(result.maxZoomReached).toBe(TEST_ZOOM_MAX);
  });

  it("moves freely within the already-reached max", () => {
    // Already reached this point; zooming back in stays within it.
    const first = applyZoomDelta(ZOOM_MIN, 50, ZOOM_MIN, TEST_ZOOM_MAX);
    const zoomedIn = applyZoomDelta(first.zoom, -10, first.maxZoomReached, TEST_ZOOM_MAX);
    expect(zoomedIn.zoom).toBeLessThan(first.zoom);
    expect(zoomedIn.maxZoomReached).toBe(first.maxZoomReached);
  });

  it("tracks maxZoomReached as the high-water mark, unaffected by zooming back in", () => {
    const out = applyZoomDelta(ZOOM_MIN, 50, ZOOM_MIN, TEST_ZOOM_MAX);
    const in_ = applyZoomDelta(out.zoom, -50, out.maxZoomReached, TEST_ZOOM_MAX);
    expect(in_.maxZoomReached).toBe(out.zoom);
  });

  describe("zoomMax (world reveal)", () => {
    // Small enough to reach in one big jump.
    const smallZoomMax = ZOOM_MIN + ZOOM_STEP * 2;

    it("reaching zoomMax is just movement — no special charge, no special state", () => {
      const result = applyZoomDelta(ZOOM_MIN, 1_000_000, ZOOM_MIN, smallZoomMax);
      expect(result).toEqual({ zoom: smallZoomMax, maxZoomReached: smallZoomMax });
    });

    it("staying at zoomMax keeps the high-water mark", () => {
      const first = applyZoomDelta(ZOOM_MIN, 1_000_000, ZOOM_MIN, smallZoomMax);
      const again = applyZoomDelta(first.zoom, 1_000_000, first.maxZoomReached, smallZoomMax);
      expect(again).toEqual(first);
    });
  });
});

describe("zoomStepsCrossed (step detection for UI/economy consumers)", () => {
  it("is 0 at the default zoom", () => {
    expect(zoomStepsCrossed(ZOOM_MIN)).toBe(0);
  });

  it("counts one step per full ZOOM_STEP crossed", () => {
    expect(zoomStepsCrossed(ZOOM_MIN + ZOOM_STEP)).toBe(1);
    expect(zoomStepsCrossed(ZOOM_MIN + ZOOM_STEP * 3)).toBe(3);
  });

  it("does not count partial steps", () => {
    expect(zoomStepsCrossed(ZOOM_MIN + ZOOM_STEP * 0.999)).toBe(0);
    expect(zoomStepsCrossed(ZOOM_MIN + ZOOM_STEP * 1.5)).toBe(1);
  });
});
