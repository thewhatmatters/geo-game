import { describe, expect, it } from "vitest";
import { applyZoomDelta, zoomStepsCrossed, ZOOM_MIN, ZOOM_STEP } from "./zoom";

// Far beyond what the small test deltas below reach.
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

  it("moves to the requested zoom for a step-sized wheel delta", () => {
    const deltaYForOneStep = ZOOM_STEP / 0.0015; // matches ZOOM_SENSITIVITY
    const result = applyZoomDelta(ZOOM_MIN, deltaYForOneStep, ZOOM_MIN, TEST_ZOOM_MAX);
    expect(result.zoom).toBeCloseTo(ZOOM_MIN + ZOOM_STEP, 5);
  });

  it("tracks maxZoomReached as the high-water mark, unaffected by zooming back in", () => {
    const out = applyZoomDelta(ZOOM_MIN, 50, ZOOM_MIN, TEST_ZOOM_MAX);
    const in_ = applyZoomDelta(out.zoom, -50, out.maxZoomReached, TEST_ZOOM_MAX);
    expect(in_.maxZoomReached).toBe(out.zoom);
    expect(in_.zoom).toBeLessThan(out.zoom);
  });

  // The clock is a pure pacer now (US-001): applyZoomDelta carries no time
  // cost at all. The step-crossing signal it leaves behind — maxZoomReached +
  // zoomStepsCrossed — is what US-004 will turn into a bounded score charge.
  it("charges no time under any zoom movement", () => {
    const result = applyZoomDelta(ZOOM_MIN, 1_000_000, ZOOM_MIN, TEST_ZOOM_MAX) as unknown as Record<string, unknown>;
    expect("penaltySeconds" in result).toBe(false);
  });
});

describe("zoomStepsCrossed", () => {
  it("counts whole ZOOM_STEP boundaries beyond ZOOM_MIN", () => {
    expect(zoomStepsCrossed(ZOOM_MIN)).toBe(0);
    expect(zoomStepsCrossed(ZOOM_MIN + ZOOM_STEP)).toBe(1);
    expect(zoomStepsCrossed(ZOOM_MIN + ZOOM_STEP * 3.5)).toBe(3);
  });
});
