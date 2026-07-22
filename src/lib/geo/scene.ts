import { getAllCountries, getCountry } from "../game/dailyCountry";
import type { Country, CountryCode, DailySelection } from "../game/dailyCountry";
import {
  pathBounds,
  subpathBounds,
  boundsToViewBox,
  viewBoxSize,
  viewBoxToBounds,
  clipBounds,
  visiblePointsBounds,
  type Bounds,
} from "./pathBounds";

/**
 * How far past the target's own bounding box the viewBox extends, relative
 * to the target's size. The target is always rendered at a consistent size
 * (this margin is fixed, not neighbor-dependent); nearby neighbors render at
 * their true relative scale/position within that frame and may partially
 * extend past its edges (correct for a large neighbor next to a small
 * target — e.g. Brazil next to Paraguay) or as a small sliver (a large
 * target next to a tiny neighbor). Large so neighbors actually have room to
 * be visible (not just a thin sliver at the frame's edge) now that the map
 * itself renders large — see .outline-demo__svg.
 */
const VIEWBOX_MARGIN_RATIO = 2.5;

/**
 * Readability boost for tiny targets. The frame is target-anchored, so a
 * target nominally always spans the same fraction of the viewBox — but a
 * tiny/scattered landmass (Wallis and Futuna: ~23 world units across, vs
 * Germany's ~102 out of WORLD_WIDTH=4000) is mostly empty ocean inside its
 * own bounding box, and its actual coastlines degrade into barely-visible
 * squiggles at that fraction. Island days have no neighbor hints, so this
 * outline is the entire visual hint. Targets whose bounding-box span (world
 * units) falls below SMALL_TARGET_SPAN earn a proportional boost, capped at
 * SMALL_TARGET_MAX_BOOST, that (a) tightens the frame — the viewBox margin
 * is divided by the boost, raising the target-to-frame ratio — and (b) is
 * exported as `targetBoost` for App.tsx to thicken and halo the target
 * stroke. Countries at or above the span threshold get exactly 1, leaving
 * large-country days (Germany, Brazil) pixel-identical.
 */
const SMALL_TARGET_SPAN = 70;
/** Cap so micro-states (Vatican: ~0.1 world units) don't get an absurdly tight frame or cartoon-thick stroke. Exported for tests. */
export const SMALL_TARGET_MAX_BOOST = 4;

/**
 * Locator rings for scattered-micro-landmass days. Even boosted, a target
 * like Wallis and Futuna — two islands ~4 viewport units each, far apart,
 * whose combined bbox IS the frame — renders as pin-sized flecks in a black
 * field; the frame can't be tightened further without cropping one island
 * out. So once targetBoost reaches LOCATOR_RING_MIN_BOOST — AND the target
 * actually has 2+ far-apart landmass clusters — the scene exports one
 * world-space center per landmass (per M...Z subpath of the target's path)
 * for App.tsx to mark with a thin "look here" ring. Normal days (boost
 * below the threshold) and compact single-landmass boosted days
 * (Luxembourg: the tightened frame already makes the shape huge) get none.
 */
export const LOCATOR_RING_MIN_BOOST = 2;
/**
 * Landmass centers closer than this ON SCREEN (px, converted via pxScale)
 * collapse into a single ring — keeps an islet cluster (e.g. Futuna +
 * Alofi, adjacent subpaths) from stacking overlapping rings, which would
 * read as clutter rather than a marker.
 */
const LOCATOR_RING_MERGE_PX = 48;

/**
 * Fallback render size (px) used only when no real viewport size is
 * available (e.g. in tests, which run outside a browser). In the app,
 * App.tsx passes the actual viewport size — the SVG now fills the whole
 * window via preserveAspectRatio="xMidYMid slice" (same technique as CSS
 * background-size: cover), so its true on-screen size is the LARGER of
 * viewport width/height (the dimension "slice" scales to cover), not a
 * fixed box. Getting this wrong (e.g. leaving it at an old fixed-box
 * value) silently makes every "desired px" constant in App.tsx render
 * several times larger than intended once the real viewport is much
 * bigger than that stale assumption.
 */
const DEFAULT_RENDER_PX = 320;

/**
 * Extent of the shared world projection (see WORLD_SIZE in
 * scripts/generate-countries-geo.mjs, which produced the paths this scene
 * composes; d3 fitSize clip extent [[0,0],[w,h]]). Single source of truth —
 * WorldMapLayer imports these rather than re-declaring them.
 */
export const WORLD_WIDTH = 4000;
export const WORLD_HEIGHT = 2000;

/**
 * The world's EFFECTIVE vertical extent — the y-range actual country data
 * occupies, computed once from every country's path bounds. The projection
 * extent (0..WORLD_HEIGHT) reaches the theoretical poles, but Natural
 * Earth's data stops at the ice edges (~35 units short on each side), so
 * clamping/fitting against the projection extent leaves a dead "ocean"
 * band above the Arctic and below Antarctica. Everything vertical — the
 * zoom ceiling, the edge clamp, the ocean hatch, the graticule — keys off
 * this instead, so a fully-zoomed-out view sits flush on Antarctica's
 * bottom edge. Horizontal wrap deliberately stays WORLD_WIDTH (the
 * projection's true 360° period), NOT the data width.
 */
export interface WorldExtentY {
  top: number;
  bottom: number;
  height: number;
}

let cachedWorldExtentY: WorldExtentY | null = null;

export function worldExtentY(): WorldExtentY {
  if (!cachedWorldExtentY) {
    let top = Infinity;
    let bottom = -Infinity;
    for (const country of Object.values(getAllCountries())) {
      const b = pathBounds(country.path);
      if (b.minY < top) top = b.minY;
      if (b.maxY > bottom) bottom = b.maxY;
    }
    cachedWorldExtentY = { top, bottom, height: bottom - top };
  }
  return cachedWorldExtentY;
}

/** Floor so a very large target country (whose own viewBox is already a sizeable fraction of the world) still gets at least a little zoom range. */
const MIN_MAX_ZOOM = 1.5;

/**
 * Clamps the world-space y the viewport should center on so the visible
 * vertical window never extends past the world's effective top/bottom
 * edges (no polar void, no dead band past the data). `visibleWorldHeight`
 * is how many world units of height the viewport currently shows; once it
 * reaches the full effective height the only valid center is the middle.
 * Pure given the cached extent — App applies the resulting shift inside
 * the zoom transform each render.
 */
export function clampWorldCenterY(desiredCy: number, visibleWorldHeight: number): number {
  const extent = worldExtentY();
  if (visibleWorldHeight >= extent.height) return extent.top + extent.height / 2;
  const half = visibleWorldHeight / 2;
  return Math.min(extent.bottom - half, Math.max(extent.top + half, desiredCy));
}

export interface NeighborSlot {
  code: CountryCode;
  country: Country;
  /** The country's full true bounding box (can extend far outside the viewBox for a large neighbor). */
  bounds: Bounds;
  /**
   * Bounding box of the neighbor's in-frame path vertices — i.e. only the
   * portion that's genuinely visible on screen; this is what a label should
   * be positioned against. Centering a label on the raw `bounds` of a huge
   * neighbor (Brazil next to Paraguay) can place it far outside the frame,
   * and even a bbox-CLIP fails for a neighbor that wraps around the target
   * (France around Luxembourg): its bbox contains the whole frame, so the
   * clip degenerates to the frame itself and the label lands dead-center on
   * the target. Falls back to the bbox clip when no vertex is in frame;
   * null if the neighbor doesn't intersect the viewBox at all.
   */
  visibleBounds: Bounds | null;
}

export interface GeoScene {
  viewBox: string;
  /** Multiply a desired on-screen pixel size by this to get viewBox user-units (stroke widths, label font sizes stay visually consistent across wildly different target sizes). */
  pxScale: number;
  neighbors: NeighborSlot[];
  /** Furthest zoom-out level (see lib/game/zoom.ts) that reveals the entire world for this scene's target — varies by target size, since a small country needs a much larger zoom multiplier to reach world scale than a huge one. */
  maxZoom: number;
  /** ≥1; readability multiplier for tiny targets (see SMALL_TARGET_SPAN). Already baked into the viewBox (tighter frame); App.tsx additionally applies it to the target's stroke width and halo. Exactly 1 for normal-size targets. */
  targetBoost: number;
  /** World-space centers to mark with locator rings (see LOCATOR_RING_MIN_BOOST) — one per (merged) landmass of the target. Empty on non-boosted days. */
  locatorCenters: Point[];
}

export interface Point {
  x: number;
  y: number;
}

function boundsCenter(b: Bounds): Point {
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

/**
 * Greedy single-pass clustering: each bounds joins the first cluster whose
 * running-union center lies within `mergeDistance` of its own center,
 * otherwise it starts a new cluster. Returns each cluster's union-bbox
 * center. Order-dependent in pathological cases, but landmass subpaths of
 * one country are either clearly together or clearly apart, which is all
 * the locator rings need. Exported for tests.
 */
export function clusterCenters(boundsList: Bounds[], mergeDistance: number): Point[] {
  const clusters: Bounds[] = [];
  for (const bounds of boundsList) {
    const center = boundsCenter(bounds);
    const existing = clusters.find((cluster) => {
      const c = boundsCenter(cluster);
      return Math.hypot(c.x - center.x, c.y - center.y) < mergeDistance;
    });
    if (existing) {
      existing.minX = Math.min(existing.minX, bounds.minX);
      existing.minY = Math.min(existing.minY, bounds.minY);
      existing.maxX = Math.max(existing.maxX, bounds.maxX);
      existing.maxY = Math.max(existing.maxY, bounds.maxY);
    } else {
      clusters.push({ ...bounds });
    }
  }
  return clusters.map(boundsCenter);
}

/**
 * Resolves today's target + neighbor codes into a shared-frame scene: one
 * target-anchored viewBox, and each neighbor's country data + bounds, ready
 * to render in the same <svg>.
 *
 * @param renderPx The actual on-screen size (px) the scene's <svg> renders
 * at — pass `Math.max(window.innerWidth, window.innerHeight)` from the app
 * (matching preserveAspectRatio="xMidYMid slice"'s cover behavior). Defaults
 * to a fixed fallback for non-browser callers (tests).
 * @param viewportHeightPx The viewport's actual height (px) — the zoom-out
 * ceiling is HEIGHT-fit: at maxZoom the world's full height exactly fills
 * the viewport, never past the poles into void; the width overflow is
 * covered by WorldMapLayer's seamless horizontal wrap. Defaults to renderPx
 * for non-browser callers.
 */
export function computeGeoScene(
  daily: Pick<DailySelection, "target" | "neighborCodes">,
  renderPx: number = DEFAULT_RENDER_PX,
  viewportHeightPx: number = renderPx,
): GeoScene {
  const targetBounds = pathBounds(daily.target.path);
  const targetSpan = Math.max(
    targetBounds.maxX - targetBounds.minX,
    targetBounds.maxY - targetBounds.minY,
  );
  const targetBoost = Math.min(SMALL_TARGET_MAX_BOOST, Math.max(1, SMALL_TARGET_SPAN / targetSpan));
  const viewBox = boundsToViewBox(targetBounds, VIEWBOX_MARGIN_RATIO / targetBoost);
  const viewBoxBounds = viewBoxToBounds(viewBox);
  const pxScale = viewBoxSize(viewBox) / renderPx;

  // A neighbor code with no country record (adjacency data naming a
  // territory the shipped dataset doesn't carry) drops out of the scene
  // entirely rather than throwing on `country.path` — the same graceful
  // path an island day already takes, just with fewer than 3 slots. Same
  // guard for a record with no geometry.
  const neighbors = daily.neighborCodes.flatMap((code) => {
    const country = getCountry(code);
    if (!country?.path) return [];
    const bounds = pathBounds(country.path);
    const visibleBounds =
      visiblePointsBounds(country.path, viewBoxBounds) ?? clipBounds(bounds, viewBoxBounds);
    return [{ code, country, bounds, visibleBounds }];
  });

  // Height-fit ceiling: visible world height at zoom z is
  // viewportHeightPx * pxScale * z, so the z where it equals the world's
  // EFFECTIVE height (see worldExtentY — actual data, not the projection's
  // theoretical poles) is the deepest zoom-out that shows no vertical
  // void. (The old ceiling was width-fit + margin, which overshot the
  // poles; the projection-extent version left a dead band under
  // Antarctica.)
  const maxZoom = Math.max(MIN_MAX_ZOOM, worldExtentY().height / (viewportHeightPx * pxScale));

  // Rings only make sense for SCATTERED landmasses (2+ clusters). A
  // single-cluster boosted target (Luxembourg, Andorra) already fills the
  // tightened frame — a ring at its center is pure noise sitting exactly
  // where the target's own reveal label renders.
  const clusters =
    targetBoost >= LOCATOR_RING_MIN_BOOST
      ? clusterCenters(subpathBounds(daily.target.path), LOCATOR_RING_MERGE_PX * pxScale)
      : [];
  const locatorCenters = clusters.length >= 2 ? clusters : [];

  return { viewBox, pxScale, neighbors, maxZoom, targetBoost, locatorCenters };
}
