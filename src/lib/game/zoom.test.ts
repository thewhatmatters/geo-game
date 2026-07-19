import { describe, expect, it } from "vitest";
import { applyZoomDelta, ZOOM_MIN, ZOOM_STEP } from "./zoom";

// Far beyond what the small test deltas below reach — isolates ordinary
// per-step behavior from the world-reveal surcharge, which gets its own
// dedicated describe block using a deliberately small zoomMax.
const TEST_ZOOM_MAX = 100;

describe("applyZoomDelta", () => {
  it("clamps at ZOOM_MIN when zooming in past the default", () => {
    const result = applyZoomDelta(ZOOM_MIN, -1000, ZOOM_MIN, TEST_ZOOM_MAX);
    expect(result.zoom).toBe(ZOOM_MIN);
  });

  it("clamps at zoomMax when zooming out past the limit", () => {
    const result = applyZoomDelta(ZOOM_MIN, 1_000_000, ZOOM_MIN, TEST_ZOOM_MAX);
    expect(result.zoom).toBe(TEST_ZOOM_MAX);
  });

  it("charges no penalty for movement that stays within the already-reached max", () => {
    // Already reached this point; zooming back in stays within it.
    const first = applyZoomDelta(ZOOM_MIN, 50, ZOOM_MIN, TEST_ZOOM_MAX);
    const zoomedIn = applyZoomDelta(first.zoom, -10, first.maxZoomReached, TEST_ZOOM_MAX);
    expect(zoomedIn.maxZoomReached).toBe(first.maxZoomReached);
  });

  it("crosses a zoom step without producing a time cost", () => {
    const deltaYForOneStep = ZOOM_STEP / 0.0015; // matches ZOOM_SENSITIVITY
    const result = applyZoomDelta(ZOOM_MIN, deltaYForOneStep, ZOOM_MIN, TEST_ZOOM_MAX);
    expect(result.zoom).toBeCloseTo(ZOOM_MIN + ZOOM_STEP, 5);
    expect(result).not.toHaveProperty("penaltySeconds");
  });

  it("can cross several tiers at once without producing a time cost", () => {
    const deltaYForThreeSteps = (ZOOM_STEP * 3) / 0.0015;
    const result = applyZoomDelta(ZOOM_MIN, deltaYForThreeSteps, ZOOM_MIN, TEST_ZOOM_MAX);
    expect(result).not.toHaveProperty("penaltySeconds");
  });

  it("never re-charges for zooming back out over territory already reached this round", () => {
    const out = applyZoomDelta(ZOOM_MIN, 50, ZOOM_MIN, TEST_ZOOM_MAX);
    const in_ = applyZoomDelta(out.zoom, -50, out.maxZoomReached, TEST_ZOOM_MAX);
    const outAgain = applyZoomDelta(in_.zoom, 50, in_.maxZoomReached, TEST_ZOOM_MAX);
    expect(outAgain.zoom).toBe(out.zoom);
  });

  it("tracks maxZoomReached as the high-water mark, unaffected by zooming back in", () => {
    const out = applyZoomDelta(ZOOM_MIN, 50, ZOOM_MIN, TEST_ZOOM_MAX);
    const in_ = applyZoomDelta(out.zoom, -50, out.maxZoomReached, TEST_ZOOM_MAX);
    expect(in_.maxZoomReached).toBe(out.zoom);
  });

  describe("world reveal", () => {
    // Small enough to reach in one big jump, isolating the surcharge.
    const smallZoomMax = ZOOM_MIN + ZOOM_STEP * 2;

    it("reaches zoomMax without producing a time cost", () => {
      const result = applyZoomDelta(ZOOM_MIN, 1_000_000, ZOOM_MIN, smallZoomMax);
      expect(result.zoom).toBe(smallZoomMax);
      expect(result).not.toHaveProperty("penaltySeconds");
    });

    it("stays at zoomMax on subsequent moves", () => {
      const first = applyZoomDelta(ZOOM_MIN, 1_000_000, ZOOM_MIN, smallZoomMax);
      const again = applyZoomDelta(first.zoom, 1_000_000, first.maxZoomReached, smallZoomMax);
      expect(again.zoom).toBe(smallZoomMax);
    });

    it("can zoom out short of zoomMax", () => {
      const result = applyZoomDelta(ZOOM_MIN, 1, ZOOM_MIN, smallZoomMax);
      expect(result.zoom).toBeLessThan(smallZoomMax);
    });
  });
});
