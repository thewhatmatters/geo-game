import { getCountry } from "../game/dailyCountry";
import type { Country, CountryCode, DailySelection } from "../game/dailyCountry";
import {
  pathBounds,
  boundsToViewBox,
  viewBoxSize,
  viewBoxToBounds,
  clipBounds,
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
 * Width of the shared world projection (see WORLD_SIZE in
 * scripts/generate-countries-geo.mjs, which produced the paths this scene
 * composes) — the reference size used to compute how far a player has to
 * zoom out before the entire world is visible.
 */
const WORLD_WIDTH = 4000;
/** Buffer factor so "fully zoomed out" comfortably shows the whole world rather than just touching its edges. */
const WORLD_ZOOM_MARGIN = 1.15;
/** Floor so a very large target country (whose own viewBox is already a sizeable fraction of the world) still gets at least a little zoom range. */
const MIN_MAX_ZOOM = 1.5;

export interface NeighborSlot {
  code: CountryCode;
  country: Country;
  /** The country's full true bounding box (can extend far outside the viewBox for a large neighbor). */
  bounds: Bounds;
  /**
   * `bounds` clipped to the scene's actual viewBox — i.e. only the portion
   * that's genuinely visible on screen. Centering a label on the raw
   * `bounds` of a huge neighbor (e.g. Brazil next to Paraguay) can place it
   * far outside the frame; this is what a label should actually be
   * positioned against. Null if the neighbor doesn't intersect the viewBox
   * at all.
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
 */
export function computeGeoScene(
  daily: Pick<DailySelection, "target" | "neighborCodes">,
  renderPx: number = DEFAULT_RENDER_PX,
): GeoScene {
  const targetBounds = pathBounds(daily.target.path);
  const viewBox = boundsToViewBox(targetBounds, VIEWBOX_MARGIN_RATIO);
  const viewBoxBounds = viewBoxToBounds(viewBox);
  const pxScale = viewBoxSize(viewBox) / renderPx;

  const neighbors = daily.neighborCodes.map((code) => {
    const country = getCountry(code);
    const bounds = pathBounds(country.path);
    return { code, country, bounds, visibleBounds: clipBounds(bounds, viewBoxBounds) };
  });

  const maxZoom = Math.max(MIN_MAX_ZOOM, (WORLD_WIDTH * WORLD_ZOOM_MARGIN) / viewBoxSize(viewBox));

  return { viewBox, pxScale, neighbors, maxZoom };
}
