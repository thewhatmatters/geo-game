/** Default zoom: the game's normal, tightly-framed view. Can't zoom in further than this. */
export const ZOOM_MIN = 1;
/** Size of a "zoom-out step" for penalty purposes — every ZOOM_STEP of new zoom-out crossed costs ZOOM_PENALTY_SECONDS. */
export const ZOOM_STEP = 0.5;
/** Flat time cost per new zoom-out step crossed, mirroring the wrong-guess penalty (one-time, not a continuous drain). */
export const ZOOM_PENALTY_SECONDS = 5;
/**
 * One-time extra charge on top of the normal per-step cost the first time a
 * player reaches `zoomMax` (the whole world visible at once) — a much
 * stronger hint than an ordinary zoom-out step, so reaching it all the way
 * costs disproportionately more than the steps leading up to it.
 */
export const WORLD_REVEAL_SURCHARGE_SECONDS = 20;
/** Wheel deltaY units per unit of zoom change. */
export const ZOOM_SENSITIVITY = 0.0015;

export interface ZoomUpdate {
  zoom: number;
  maxZoomReached: number;
  penaltySeconds: number;
}

/**
 * How many whole ZOOM_STEP boundaries a zoom level has crossed beyond
 * ZOOM_MIN. Exported so the UI layer can detect the exact same
 * step-crossings the penalty charges for (e.g. App's reveal pulse fires
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
 * target country is). Zooming out past a new ZOOM_STEP tier this round
 * costs a flat ZOOM_PENALTY_SECONDS, tracked via `maxZoomReached` (the
 * furthest zoom-out reached so far) so zooming back in and back out over
 * already-seen territory never re-charges — same one-time-cost shape as a
 * wrong guess. Reaching `zoomMax` itself additionally charges
 * WORLD_REVEAL_SURCHARGE_SECONDS, once.
 */
export function applyZoomDelta(current: number, deltaY: number, maxZoomReached: number, zoomMax: number): ZoomUpdate {
  const next = Math.min(zoomMax, Math.max(ZOOM_MIN, current + deltaY * ZOOM_SENSITIVITY));
  const newMax = Math.max(maxZoomReached, next);
  const newSteps = Math.max(0, zoomStepsCrossed(newMax) - zoomStepsCrossed(maxZoomReached));
  let penaltySeconds = newSteps * ZOOM_PENALTY_SECONDS;

  const reachedWorldBefore = maxZoomReached >= zoomMax;
  const reachedWorldNow = newMax >= zoomMax;
  if (reachedWorldNow && !reachedWorldBefore) {
    penaltySeconds += WORLD_REVEAL_SURCHARGE_SECONDS;
  }

  return { zoom: next, maxZoomReached: newMax, penaltySeconds };
}
