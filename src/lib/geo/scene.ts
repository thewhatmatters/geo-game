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

/** On-screen pixel width CountryOutline/the scene SVG renders at (matches .outline-demo__svg in index.css) — used to convert a desired px size (stroke width, label font) into viewBox user-units. */
export const SCENE_RENDER_PX = 320;

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
}

/** Resolves today's target + neighbor codes into a shared-frame scene: one target-anchored viewBox, and each neighbor's country data + bounds, ready to render in the same <svg>. */
export function computeGeoScene(daily: Pick<DailySelection, "target" | "neighborCodes">): GeoScene {
  const targetBounds = pathBounds(daily.target.path);
  const viewBox = boundsToViewBox(targetBounds, VIEWBOX_MARGIN_RATIO);
  const viewBoxBounds = viewBoxToBounds(viewBox);
  const pxScale = viewBoxSize(viewBox) / SCENE_RENDER_PX;

  const neighbors = daily.neighborCodes.map((code) => {
    const country = getCountry(code);
    const bounds = pathBounds(country.path);
    return { code, country, bounds, visibleBounds: clipBounds(bounds, viewBoxBounds) };
  });

  return { viewBox, pxScale, neighbors };
}
