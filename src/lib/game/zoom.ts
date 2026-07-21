/** Default zoom: the game's normal, tightly-framed view. Can't zoom in further than this. */
export const ZOOM_MIN = 1;
/** Size of a "zoom-out step" — the discrete unit of map exploration the UI reacts to (reveal pulse) and the score economy prices (see lib/game/round.ts). */
export const ZOOM_STEP = 0.5;
/**
 * Zoom units applied per unit of wheel `deltaY` in `applyZoomDelta`.
 *
 * US-008 retune (was 0.0015 → now 0.004): at 0.0015 a typical mouse-wheel
 * notch (~100 deltaY) only moved zoom by 0.15 — about 30% of one ZOOM_STEP —
 * so scroll/trackpad felt sluggish. 0.004 yields ~0.40 zoom per notch
 * (nearly one ZOOM_STEP), which is clearly visible without jumping multiple
 * priced steps in a single notch.
 *
 * On-screen +/- buttons use `ZOOM_STEP / ZOOM_SENSITIVITY` as their synthetic
 * deltaY, so one click still equals exactly one ZOOM_STEP regardless of this
 * constant — buttons stay proportionate when sensitivity is retuned.
 */
export const ZOOM_SENSITIVITY = 0.004;

export interface ZoomUpdate {
  zoom: number;
  maxZoomReached: number;
}

/**
 * How many whole ZOOM_STEP boundaries a zoom level has crossed beyond
 * ZOOM_MIN. Exported so the UI layer can detect step-crossings (e.g. App's
 * reveal pulse fires once per newly-crossed step) and the round reducer can
 * price newly-crossed steps without duplicating this arithmetic.
 */
export function zoomStepsCrossed(zoomLevel: number): number {
  return Math.floor((zoomLevel - ZOOM_MIN) / ZOOM_STEP);
}

/**
 * Applies a wheel deltaY to the current zoom level, clamped to [ZOOM_MIN,
 * `zoomMax`] — `zoomMax` is scene-specific (see computeGeoScene's `maxZoom`,
 * derived from the target's own viewBox size so it always corresponds to
 * "the whole world visible" regardless of how large or small that day's
 * target country is). Pure movement only: the clock is a pacer, never a
 * wallet, so zooming no longer costs time (any future score charge is a
 * RoundCore concern, computed from zoomStepsCrossed). `maxZoomReached`
 * still tracks the furthest zoom-out reached this round so consumers can
 * tell NEW territory from re-crossing already-seen territory.
 */
export function applyZoomDelta(current: number, deltaY: number, maxZoomReached: number, zoomMax: number): ZoomUpdate {
  const next = Math.min(zoomMax, Math.max(ZOOM_MIN, current + deltaY * ZOOM_SENSITIVITY));
  return { zoom: next, maxZoomReached: Math.max(maxZoomReached, next) };
}
