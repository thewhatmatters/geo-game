export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Bounding box of a d3-geo-generated SVG path string. These paths only ever
 * use M/L (each followed by an x,y pair) and Z (no coordinates), so pulling
 * every number out in order and pairing them as (x, y) is reliable — no need
 * for a full SVG path parser.
 */
export function pathBounds(path: string): Bounds {
  const numbers = path.match(/-?\d+\.?\d*/g)?.map(Number) ?? [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i + 1 < numbers.length; i += 2) {
    const x = numbers[i];
    const y = numbers[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Bounding box of each M...Z subpath — one closed ring per landmass for the
 * d3-geo-generated paths described in pathBounds' note. Splitting on "M" is
 * safe for that format (the only other tokens are numbers, commas, L and Z),
 * and lets callers locate the individual islands of a scattered
 * multi-landmass country whose combined bounds are mostly empty ocean.
 */
export function subpathBounds(path: string): Bounds[] {
  return path
    .split("M")
    .filter((segment) => segment.trim().length > 0)
    .map((segment) => pathBounds(segment));
}

/** Square SVG viewBox string centered on `bounds`, padded by `marginRatio` on each side relative to the larger dimension. */
export function boundsToViewBox(bounds: Bounds, marginRatio: number): string {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const size = Math.max(width, height) * (1 + marginRatio * 2);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return `${cx - size / 2} ${cy - size / 2} ${size} ${size}`;
}

/** The numeric width of a viewBox string produced by boundsToViewBox (or any "minX minY width height" string). */
export function viewBoxSize(viewBox: string): number {
  const parts = viewBox.split(/\s+/).map(Number);
  return parts[2];
}

/** Parses a "minX minY width height" viewBox string back into Bounds. */
export function viewBoxToBounds(viewBox: string): Bounds {
  const [minX, minY, width, height] = viewBox.split(/\s+/).map(Number);
  return { minX, minY, maxX: minX + width, maxY: minY + height };
}

/**
 * Intersection of `bounds` with `container` — the portion of a shape that's
 * actually visible within a given viewBox, not its full true extent (which
 * can be far larger than what's on screen for a big neighbor country).
 * Returns null when they don't overlap at all.
 */
export function clipBounds(bounds: Bounds, container: Bounds): Bounds | null {
  const minX = Math.max(bounds.minX, container.minX);
  const maxX = Math.min(bounds.maxX, container.maxX);
  const minY = Math.max(bounds.minY, container.minY);
  const maxY = Math.min(bounds.maxY, container.maxY);
  if (minX >= maxX || minY >= maxY) return null;
  return { minX, minY, maxX, maxY };
}
