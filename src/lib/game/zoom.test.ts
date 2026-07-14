import { describe, expect, it } from "vitest";
import { applyZoomDelta, WORLD_REVEAL_SURCHARGE_SECONDS, ZOOM_MIN, ZOOM_PENALTY_SECONDS, ZOOM_STEP } from "./zoom";

// Far beyond what the small test deltas below reach — isolates ordinary
// per-step behavior from the world-reveal surcharge, which gets its own
// dedicated describe block using a deliberately small zoomMax.
const TEST_ZOOM_MAX = 100;

describe("applyZoomDelta", () => {
  it("clamps at ZOOM_MIN when zooming in past the default", () => {
    const result = applyZoomDelta(ZOOM_MIN, -1000, ZOOM_MIN, TEST_ZOOM_MAX);
    expect(result.zoom).toBe(ZOOM_MIN);
    expect(result.penaltySeconds).toBe(0);
  });

  it("clamps at zoomMax when zooming out past the limit", () => {
    const result = applyZoomDelta(ZOOM_MIN, 1_000_000, ZOOM_MIN, TEST_ZOOM_MAX);
    expect(result.zoom).toBe(TEST_ZOOM_MAX);
  });

  it("charges no penalty for movement that stays within the already-reached max", () => {
    // Already reached this point; zooming back in stays within it.
    const first = applyZoomDelta(ZOOM_MIN, 50, ZOOM_MIN, TEST_ZOOM_MAX);
    const zoomedIn = applyZoomDelta(first.zoom, -10, first.maxZoomReached, TEST_ZOOM_MAX);
    expect(zoomedIn.penaltySeconds).toBe(0);
  });

  it("charges exactly one step penalty when crossing exactly one new ZOOM_STEP tier", () => {
    const deltaYForOneStep = ZOOM_STEP / 0.0015; // matches ZOOM_SENSITIVITY
    const result = applyZoomDelta(ZOOM_MIN, deltaYForOneStep, ZOOM_MIN, TEST_ZOOM_MAX);
    expect(result.zoom).toBeCloseTo(ZOOM_MIN + ZOOM_STEP, 5);
    expect(result.penaltySeconds).toBe(ZOOM_PENALTY_SECONDS);
  });

  it("charges multiple step penalties when a single jump crosses several tiers at once", () => {
    const deltaYForThreeSteps = (ZOOM_STEP * 3) / 0.0015;
    const result = applyZoomDelta(ZOOM_MIN, deltaYForThreeSteps, ZOOM_MIN, TEST_ZOOM_MAX);
    expect(result.penaltySeconds).toBe(ZOOM_PENALTY_SECONDS * 3);
  });

  it("never re-charges for zooming back out over territory already reached this round", () => {
    const out = applyZoomDelta(ZOOM_MIN, 50, ZOOM_MIN, TEST_ZOOM_MAX);
    const in_ = applyZoomDelta(out.zoom, -50, out.maxZoomReached, TEST_ZOOM_MAX);
    const outAgain = applyZoomDelta(in_.zoom, 50, in_.maxZoomReached, TEST_ZOOM_MAX);
    expect(outAgain.penaltySeconds).toBe(0);
    expect(outAgain.zoom).toBe(out.zoom);
  });

  it("tracks maxZoomReached as the high-water mark, unaffected by zooming back in", () => {
    const out = applyZoomDelta(ZOOM_MIN, 50, ZOOM_MIN, TEST_ZOOM_MAX);
    const in_ = applyZoomDelta(out.zoom, -50, out.maxZoomReached, TEST_ZOOM_MAX);
    expect(in_.maxZoomReached).toBe(out.zoom);
  });

  describe("world-reveal surcharge", () => {
    // Small enough to reach in one big jump, isolating the surcharge.
    const smallZoomMax = ZOOM_MIN + ZOOM_STEP * 2;

    it("charges the surcharge on top of the normal step cost the first time zoomMax is reached", () => {
      const result = applyZoomDelta(ZOOM_MIN, 1_000_000, ZOOM_MIN, smallZoomMax);
      expect(result.zoom).toBe(smallZoomMax);
      const expectedSteps = Math.floor((smallZoomMax - ZOOM_MIN) / ZOOM_STEP);
      expect(result.penaltySeconds).toBe(expectedSteps * ZOOM_PENALTY_SECONDS + WORLD_REVEAL_SURCHARGE_SECONDS);
    });

    it("does not re-charge the surcharge on subsequent moves that stay at zoomMax", () => {
      const first = applyZoomDelta(ZOOM_MIN, 1_000_000, ZOOM_MIN, smallZoomMax);
      const again = applyZoomDelta(first.zoom, 1_000_000, first.maxZoomReached, smallZoomMax);
      expect(again.penaltySeconds).toBe(0);
    });

    it("does not charge the surcharge for zooming out short of zoomMax", () => {
      const result = applyZoomDelta(ZOOM_MIN, 1, ZOOM_MIN, smallZoomMax);
      expect(result.zoom).toBeLessThan(smallZoomMax);
      expect(result.penaltySeconds).toBe(0);
    });
  });
});
