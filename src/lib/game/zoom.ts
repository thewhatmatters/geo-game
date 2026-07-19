/** Default zoom: the game's normal, tightly-framed view. Can't zoom in further than this. */
export const ZOOM_MIN = 1;
/** Size of a "zoom-out step" — step crossings drive UI pulses now; score cost lands in US-004. */
export const ZOOM_STEP = 0.5;
/** Wheel deltaY units per unit of zoom change. */
export const ZOOM_SENSITIVITY = 0.0015;

export interface ZoomUpdate {
  zoom: number;
  maxZoomReached: number;
  /**
   * How many whole ZOOM_STEP boundaries this delta newly crossed beyond
   * `maxZoomReached`. Pure step accounting — no time cost (US-001). US-004
   * will turn this into a score charge (−10/step, −100 cap).
   */
  newStepsCrossed: number;
}

/**
 * How many whole ZOOM_STEP boundaries a zoom level has crossed beyond
 * ZOOM_MIN. Exported so the UI layer can detect the exact same
 * step-crossings the economy keys off (e.g. App's reveal pulse fires
 * once per newly-crossed step) without duplicating this arithmetic.
 */
export function zoomStepsCrossed(zoomLevel: number): number {
  return Math.floor((zoomLevel - ZOOM_MIN) / ZOOM_STEP);
}

/**
 * Applies a wheel deltaY to the current zoom level, clamped to [ZOOM_MIN,
 * `zoomMax`] — `zoomMax` is scene-specific (see computeGeoScene's `maxZoom`,
 * derived from the target's own viewBox size so it always corresponds to
 * "the whole world visible" regardless of how large or small that day's
 * target country is). Tracks `maxZoomReached` (the furthest zoom-out
 * reached so far) so re-crossing already-seen territory never re-counts as
 * a new step — same one-time-cost shape the score economy will use.
 * No time cost: the clock is a pure pacer (US-001).
 */
export function applyZoomDelta(current: number, deltaY: number, maxZoomReached: number, zoomMax: number): ZoomUpdate {
  const next = Math.min(zoomMax, Math.max(ZOOM_MIN, current + deltaY * ZOOM_SENSITIVITY));
  const newMax = Math.max(maxZoomReached, next);
  const newStepsCrossed = Math.max(0, zoomStepsCrossed(newMax) - zoomStepsCrossed(maxZoomReached));

  return { zoom: next, maxZoomReached: newMax, newStepsCrossed };
}
