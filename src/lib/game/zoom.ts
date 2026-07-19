/** Default zoom: the game's normal, tightly-framed view. Can't zoom in further than this. */
export const ZOOM_MIN = 1;
/** Size of a "zoom-out step" — the unit US-004 charges score for. Kept here as the step-detection primitive even though the clock no longer pays for it. */
export const ZOOM_STEP = 0.5;
/** Wheel deltaY units per unit of zoom change. */
export const ZOOM_SENSITIVITY = 0.0015;

export interface ZoomUpdate {
  zoom: number;
  maxZoomReached: number;
}

/**
 * How many whole ZOOM_STEP boundaries a zoom level has crossed beyond
 * ZOOM_MIN. Exported so the UI layer (App's reveal pulse) and US-004's score
 * charge can detect the exact same step-crossings without duplicating this
 * arithmetic.
 */
export function zoomStepsCrossed(zoomLevel: number): number {
  return Math.floor((zoomLevel - ZOOM_MIN) / ZOOM_STEP);
}

/**
 * Applies a wheel deltaY to the current zoom level, clamped to [ZOOM_MIN,
 * `zoomMax`] — `zoomMax` is scene-specific (see computeGeoScene's `maxZoom`,
 * derived from the target's own viewBox size so it always corresponds to
 * "the whole world visible" regardless of how large or small that day's
 * target country is). Zooming is now free of any time cost (US-001: the clock
 * is a pure pacer); it only moves the view and advances `maxZoomReached`, the
 * high-water mark US-004 will use to charge newly-seen territory as score.
 */
export function applyZoomDelta(current: number, deltaY: number, maxZoomReached: number, zoomMax: number): ZoomUpdate {
  const next = Math.min(zoomMax, Math.max(ZOOM_MIN, current + deltaY * ZOOM_SENSITIVITY));
  const newMax = Math.max(maxZoomReached, next);
  return { zoom: next, maxZoomReached: newMax };
}
