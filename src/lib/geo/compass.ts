import { getCountry } from "../game/dailyCountry";
import type { Country, CountryCode, DailySelection } from "../game/dailyCountry";

/** Fixed 8-point compass, clockwise from north — see CLAUDE.md's neighbor-slot rule. */
export const COMPASS_ANCHORS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export type CompassAnchor = (typeof COMPASS_ANCHORS)[number];

const ANCHOR_VECTORS: Record<CompassAnchor, { dx: number; dy: number }> = {
  N: { dx: 0, dy: -1 },
  NE: { dx: 0.7071, dy: -0.7071 },
  E: { dx: 1, dy: 0 },
  SE: { dx: 0.7071, dy: 0.7071 },
  S: { dx: 0, dy: 1 },
  SW: { dx: -0.7071, dy: 0.7071 },
  W: { dx: -1, dy: 0 },
  NW: { dx: -0.7071, dy: -0.7071 },
};

/** Unit (dx, dy) for a compass anchor, screen coordinates (dy positive = down). */
export function anchorVector(anchor: CompassAnchor): { dx: number; dy: number } {
  return ANCHOR_VECTORS[anchor];
}

/** Initial great-circle bearing in degrees (0 = north, clockwise) from `from` to `to`. */
function bearingDegrees(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const phi1 = toRad(from.lat);
  const phi2 = toRad(to.lat);
  const deltaLambda = toRad(to.lng - from.lng);

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  const theta = Math.atan2(y, x);
  return ((theta * 180) / Math.PI + 360) % 360;
}

function nearestAnchorIndex(bearing: number): number {
  return Math.round(bearing / 45) % 8;
}

export interface NeighborSlot {
  code: CountryCode;
  country: Country;
  anchor: CompassAnchor;
}

/**
 * Assigns each neighbor its nearest 8-point compass anchor relative to the
 * target's centroid. When two neighbors round to the same anchor, the later
 * one (in `neighbors` order) is bumped to the nearest still-unused anchor
 * — alternating +1/-1, +2/-2, ... steps around the compass — rather than
 * overlapping the first. Reasonable default per US-008's flagged ambiguity;
 * revisit if it looks wrong with real neighbor geometry on screen.
 */
export function assignCompassAnchors(
  target: Pick<Country, "centroid">,
  neighbors: Array<{ code: CountryCode; country: Pick<Country, "centroid"> }>,
): Array<{ code: CountryCode; anchor: CompassAnchor }> {
  const used = new Set<number>();

  return neighbors.map(({ code, country }) => {
    const idealIndex = nearestAnchorIndex(bearingDegrees(target.centroid, country.centroid));

    let index = idealIndex;
    for (let offset = 0; used.has(index); offset++) {
      const direction = offset % 2 === 0 ? 1 : -1;
      const magnitude = Math.ceil((offset + 1) / 2);
      index = (idealIndex + direction * magnitude + 8 * 8) % 8;
    }
    used.add(index);
    return { code, anchor: COMPASS_ANCHORS[index] };
  });
}

/** Resolves today's neighbor codes to full country data + their compass slot, in one call for rendering. */
export function computeNeighborSlots(daily: Pick<DailySelection, "target" | "neighborCodes">): NeighborSlot[] {
  const neighbors = daily.neighborCodes.map((code) => ({ code, country: getCountry(code) }));
  const anchors = assignCompassAnchors(daily.target, neighbors);
  return anchors.map((slot, i) => ({ ...slot, country: neighbors[i].country }));
}
