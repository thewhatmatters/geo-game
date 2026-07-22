import type { GeoScene, Point } from "./scene";
import { clampWorldCenterY, worldExtentY } from "./scene";
import { viewBoxSize, viewBoxToBounds } from "./pathBounds";
import { ZOOM_MIN } from "../game/zoom";

/**
 * Camera — the per-render view math App applies to the scene's <svg>:
 * where the zoom pivots, how far the world must shift to stay inside its
 * own vertical extent, and how far the player may drag-pan. Pure functions
 * of (scene, viewport, zoom, panel offset), so the whole clamp geometry is
 * testable without React or a browser.
 */

/**
 * How far the player can drag-pan the view, expressed as a multiple of the
 * target's own base viewBox size per unit of zoom beyond ZOOM_MIN. At
 * ZOOM_MIN (no zoom-out yet) this is 0 — panning is disabled until you've
 * paid at least some zoom-out cost, since there's nothing extra revealed to
 * pan into yet. This deliberately keeps panning from being a free way to
 * peek at zoomed-in detail far from the target without ever crossing a
 * zoom-out penalty threshold.
 */
const PAN_RADIUS_FACTOR = 0.5;

/**
 * ABSOLUTE zoom-out units (zoom - ZOOM_MIN) over which the world layer's
 * reveal opacity ramps from 0 to full. Deliberately NOT a fraction of the
 * scene's full zoom range: maxZoom is derived from the target's viewBox
 * size, so on tiny-target days it's enormous (hundreds), and a
 * fraction-of-range opacity collapses to ~0 for the first several paid
 * zoom steps — the player pays -5s per step and sees nothing change. Keyed
 * to absolute units, every step produces a visible brightness delta on
 * every day-size. Tuned so the first two paid button steps are each
 * unmistakable at a glance: step 1 (zoom 1.5) lands at 0.5/1.1 ≈ 0.45
 * revealed, step 2 (zoom 2.0) at 1.0/1.1 ≈ 0.91, and step 3+ is fully
 * saturated. The reveal RADIUS still scales with the full range (see
 * computeWorldReveal), preserving the radial near-target-first character.
 */
const WORLD_REVEAL_OPACITY_ZOOM_SPAN = 1.1;

export interface Camera {
  /** Center of the scene's viewBox — the zoom transform pivots here, so the target stays centered regardless of zoom level. */
  originX: number;
  originY: number;
  /** The HUD-panel-centering offset in viewBox user-units — an svg-internal pan-level shift (screen px → units via pxScale) so the svg always covers the full viewport while the map centers in the CLEAR gap between unequal top/bottom panels. */
  panelOffsetUnits: number;
  /**
   * Vertical world-edge clamp: the zoom pivots on the target, so a
   * far-north/south target (Falklands, Iceland) would drag polar void into
   * frame as the viewport's world-window approaches the world's height.
   * This is the world-space shift (applied inside the zoom transform) that
   * keeps the visible vertical window inside the world's effective extent;
   * zero until the window nears an edge, so default framing is untouched.
   * The panel offset participates: a pan-level shift of dy moves the
   * visible world center by -dy·zoom, and when the window hits a world
   * edge, edge-pinning wins over gap-centering.
   */
  worldShiftY: number;
  /** Drag-pan budget radius (viewBox units) — proportional to paid zoom-out, see PAN_RADIUS_FACTOR. */
  maxPanRadius: number;
  /**
   * Vertical pan bounds: a pan of dy moves the visible world-center by
   * -dy·zoom, so these are the dy bounds that keep the window inside the
   * world's effective extent (same range worldShiftY's resting clamp
   * enforces). At full zoom-out the window spans the whole height and both
   * collapse to 0 — vertical drag locks while horizontal drag (which
   * wraps) stays free. min/max guards absorb float error at the ceiling.
   */
  panYMin: number;
  panYMax: number;
}

export function computeCamera(
  scene: Pick<GeoScene, "viewBox" | "pxScale">,
  viewportHeightPx: number,
  zoom: number,
  verticalOffsetPx: number,
): Camera {
  const bounds = viewBoxToBounds(scene.viewBox);
  const originX = (bounds.minX + bounds.maxX) / 2;
  const originY = (bounds.minY + bounds.maxY) / 2;

  const panelOffsetUnits = verticalOffsetPx * scene.pxScale;
  const visibleWorldHeight = viewportHeightPx * scene.pxScale * zoom;
  const desiredWorldCenterY = originY - panelOffsetUnits * zoom;
  const clampedWorldCenterY = clampWorldCenterY(desiredWorldCenterY, visibleWorldHeight);
  const worldShiftY = desiredWorldCenterY - clampedWorldCenterY;

  const halfWindow = visibleWorldHeight / 2;
  const panYMin = Math.min(0, (clampedWorldCenterY - (worldExtentY().bottom - halfWindow)) / zoom);
  const panYMax = Math.max(0, (clampedWorldCenterY - (worldExtentY().top + halfWindow)) / zoom);

  const maxPanRadius = viewBoxSize(scene.viewBox) * (zoom - ZOOM_MIN) * PAN_RADIUS_FACTOR;

  return { originX, originY, panelOffsetUnits, worldShiftY, maxPanRadius, panYMin, panYMax };
}

/**
 * Bounds a pan vector two ways: overall magnitude to the camera's
 * maxPanRadius (the paid zoom-out budget), then the y component into
 * [panYMin, panYMax] — the range within which the visible world-window
 * stays inside the world's effective vertical extent. Horizontal stays
 * free within the radius (the world wraps seamlessly there); vertical
 * hard-stops at the poles, collapsing to zero at full zoom-out where the
 * window already spans the whole height.
 */
export function clampPan(camera: Camera, pan: Point): Point {
  let { x, y } = pan;
  if (camera.maxPanRadius <= 0) return { x: 0, y: 0 };
  const magnitude = Math.hypot(x, y);
  if (magnitude > camera.maxPanRadius) {
    const scale = camera.maxPanRadius / magnitude;
    x *= scale;
    y *= scale;
  }
  return { x, y: Math.min(camera.panYMax, Math.max(camera.panYMin, y)) };
}

export interface WorldReveal {
  /**
   * World-space radius of the radial reveal spotlight. It lives in the
   * SAME pre-ambient-transform (world) coordinate space as the country
   * paths, which is itself wrapped in the ambient <g scale(1/zoom)> — so a
   * radius that scales with `zoom` alone would exactly cancel that ambient
   * shrink and stay a CONSTANT size on screen. To make the on-screen
   * spotlight actually widen (not just move more world-content past a
   * fixed-size window), the radius carries an additional, independent
   * zoomProgress term on top of the `* zoom` baseline — `(0.5 +
   * zoomProgress)` — so it covers roughly half the viewport at minimum
   * zoom and comfortably overshoots the whole viewport by the time
   * zoomProgress reaches 1 (guaranteeing full, un-vignetted coverage once
   * fully zoomed out, not just a soft fade at the corners).
   */
  revealRadius: number;
  /**
   * 0–1 opacity at the reveal's center — keyed to ABSOLUTE zoom-out units
   * (see WORLD_REVEAL_OPACITY_ZOOM_SPAN), clamped to the scene's own range
   * so large-target days (maxZoom near ZOOM_MIN — the range can be SHORTER
   * than the fixed span) still reach full opacity at their max.
   */
  peakOpacity: number;
}

export function computeWorldReveal(
  scene: Pick<GeoScene, "viewBox" | "maxZoom">,
  zoom: number,
): WorldReveal {
  const zoomProgress = Math.min(1, Math.max(0, (zoom - ZOOM_MIN) / (scene.maxZoom - ZOOM_MIN)));
  const opacityZoomSpan = Math.min(WORLD_REVEAL_OPACITY_ZOOM_SPAN, scene.maxZoom - ZOOM_MIN);
  const peakOpacity = Math.min(1, Math.max(0, (zoom - ZOOM_MIN) / opacityZoomSpan));
  const revealRadius = viewBoxSize(scene.viewBox) * zoom * (0.5 + zoomProgress);
  return { revealRadius, peakOpacity };
}
