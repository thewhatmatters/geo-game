import { describe, expect, it } from "vitest";
import { applyZoomDelta, ZOOM_MIN, ZOOM_STEP, zoomStepsCrossed } from "./zoom";

// Far beyond what the small test deltas below reach — isolates ordinary
// per-step behavior from max-zoom clamping, which gets its own cases.
const TEST_ZOOM_MAX = 100;

describe("applyZoomDelta", () => {
  it("clamps at ZOOM_MIN when zooming in past the default", () => {
    const result = applyZoomDelta(ZOOM_MIN, -1000, ZOOM_MIN, TEST_ZOOM_MAX);
    expect(result.zoom).toBe(ZOOM_MIN);
    expect(result.newStepsCrossed).toBe(0);
  });

  it("clamps at zoomMax when zooming out past the limit", () => {
    const result = applyZoomDelta(ZOOM_MIN, 1_000_000, ZOOM_MIN, TEST_ZOOM_MAX);
    expect(result.zoom).toBe(TEST_ZOOM_MAX);
  });

  it("counts no new steps for movement that stays within the already-reached max", () => {
    const first = applyZoomDelta(ZOOM_MIN, 50, ZOOM_MIN, TEST_ZOOM_MAX);
    const zoomedIn = applyZoomDelta(first.zoom, -10, first.maxZoomReached, TEST_ZOOM_MAX);
    expect(zoomedIn.newStepsCrossed).toBe(0);
  });

  it("counts exactly one new step when crossing exactly one new ZOOM_STEP tier", () => {
    const deltaYForOneStep = ZOOM_STEP / 0.0015; // matches ZOOM_SENSITIVITY
    const result = applyZoomDelta(ZOOM_MIN, deltaYForOneStep, ZOOM_MIN, TEST_ZOOM_MAX);
    expect(result.zoom).toBeCloseTo(ZOOM_MIN + ZOOM_STEP, 5);
    expect(result.newStepsCrossed).toBe(1);
  });

  it("counts multiple new steps when a single jump crosses several tiers at once", () => {
    const deltaYForThreeSteps = (ZOOM_STEP * 3) / 0.0015;
    const result = applyZoomDelta(ZOOM_MIN, deltaYForThreeSteps, ZOOM_MIN, TEST_ZOOM_MAX);
    expect(result.newStepsCrossed).toBe(3);
  });

  it("never re-counts zooming back out over territory already reached this round", () => {
    const out = applyZoomDelta(ZOOM_MIN, 50, ZOOM_MIN, TEST_ZOOM_MAX);
    const in_ = applyZoomDelta(out.zoom, -50, out.maxZoomReached, TEST_ZOOM_MAX);
    const outAgain = applyZoomDelta(in_.zoom, 50, in_.maxZoomReached, TEST_ZOOM_MAX);
    expect(outAgain.newStepsCrossed).toBe(0);
    expect(outAgain.zoom).toBe(out.zoom);
  });

  it("tracks maxZoomReached as the high-water mark, unaffected by zooming back in", () => {
    const out = applyZoomDelta(ZOOM_MIN, 50, ZOOM_MIN, TEST_ZOOM_MAX);
    const in_ = applyZoomDelta(out.zoom, -50, out.maxZoomReached, TEST_ZOOM_MAX);
    expect(in_.maxZoomReached).toBe(out.zoom);
  });

  it("zoomStepsCrossed matches applyZoomDelta's new-step accounting", () => {
    const deltaYForTwoSteps = (ZOOM_STEP * 2) / 0.0015;
    const result = applyZoomDelta(ZOOM_MIN, deltaYForTwoSteps, ZOOM_MIN, TEST_ZOOM_MAX);
    expect(result.newStepsCrossed).toBe(zoomStepsCrossed(result.maxZoomReached) - zoomStepsCrossed(ZOOM_MIN));
  });

  describe("world reveal (no time surcharge)", () => {
    const smallZoomMax = ZOOM_MIN + ZOOM_STEP * 2;

    it("reaches zoomMax and reports steps without a time surcharge field", () => {
      const result = applyZoomDelta(ZOOM_MIN, 1_000_000, ZOOM_MIN, smallZoomMax);
      expect(result.zoom).toBe(smallZoomMax);
      const expectedSteps = Math.floor((smallZoomMax - ZOOM_MIN) / ZOOM_STEP);
      expect(result.newStepsCrossed).toBe(expectedSteps);
      // No penaltySeconds / WORLD_REVEAL_SURCHARGE — pure step accounting.
      expect(result).not.toHaveProperty("penaltySeconds");
    });

    it("does not re-count steps on subsequent moves that stay at zoomMax", () => {
      const first = applyZoomDelta(ZOOM_MIN, 1_000_000, ZOOM_MIN, smallZoomMax);
      const again = applyZoomDelta(first.zoom, 1_000_000, first.maxZoomReached, smallZoomMax);
      expect(again.newStepsCrossed).toBe(0);
    });

    it("counts no new steps for zooming out short of the first ZOOM_STEP tier", () => {
      const result = applyZoomDelta(ZOOM_MIN, 1, ZOOM_MIN, smallZoomMax);
      expect(result.zoom).toBeLessThan(smallZoomMax);
      expect(result.newStepsCrossed).toBe(0);
    });
  });
});
