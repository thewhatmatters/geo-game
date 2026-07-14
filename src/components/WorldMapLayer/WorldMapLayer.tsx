import type { Country, CountryCode } from "../../lib/game/dailyCountry";

/** Fainter than NEIGHBOR_COLOR — this is tertiary background context, not something the player needs to read. Layered underneath the radial reveal mask in App.tsx (which multiplies this down further), so the base alpha needs headroom to still be legible during the gradual mid-zoom reveal, not just once fully zoomed out. */
const WORLD_COLOR = "rgba(255, 255, 255, 0.4)";
const OCEAN_LINE_COLOR = "rgba(255, 255, 255, 0.22)";
/** Matches the page background (index.css `body { background: #000; }`) — masks the ocean hatch under actual landmasses. Without an opaque fill here, the ocean rect (which spans the whole world, not just literal water) would bleed through every country's interior, not just true gaps between them. */
const LAND_MASK_COLOR = "#000";

/**
 * World projection extent — matches WORLD_SIZE in
 * scripts/generate-countries-geo.mjs and d3's fitSize default clip extent
 * ([[0,0],[w,h]]), so every country's path (all projected by that one
 * shared call) falls within this rectangle.
 */
const WORLD_WIDTH = 4000;
const WORLD_HEIGHT = 2000;

/**
 * The reveal is a SQUARE (uniform scale in x and y — see App.tsx's zoom
 * transform), but the world itself is a 4000x2000 (2:1) equirectangular
 * rectangle. At full zoom-out the square necessarily grows to fully cover
 * the WIDTH (matching computeGeoScene's maxZoom, ~worldWidth * 1.15 =
 * 4600), which — being square — tries to show that same ~4600 units of
 * HEIGHT too, well past the poles where no ocean rect or country data
 * exists at all. Without this margin, that shows up as hard black bars
 * top/bottom on wide viewports (a "slice" crop shows more width, less
 * height, but the underlying overshoot is there regardless of aspect
 * ratio). Only the OCEAN TEXTURE needs extending past the real world
 * bounds — actual country paths correctly stop at real landmass edges.
 */
const HATCH_MARGIN = 1600;
const HATCH_X = -HATCH_MARGIN;
const HATCH_Y = -HATCH_MARGIN;
const HATCH_WIDTH = WORLD_WIDTH + HATCH_MARGIN * 2;
const HATCH_HEIGHT = WORLD_HEIGHT + HATCH_MARGIN * 2;

const OCEAN_HATCH_ID = "ocean-hatch";
/** Tile size (world units) and line thickness for the ocean hatch — smaller tile = tighter-packed diagonal lines. */
const OCEAN_HATCH_TILE = 7;
const OCEAN_HATCH_LINE_WIDTH = 1.25;

const REVEAL_GRADIENT_ID = "world-reveal-gradient";
const REVEAL_MASK_ID = "world-reveal-mask";

export interface WorldMapLayerProps {
  /** Every country, keyed by code (see getAllCountries) — this component decides what to skip, not the caller. */
  countries: Record<CountryCode, Country>;
  /**
   * The target + its neighbors — every country still gets the opaque
   * land-mask fill here (otherwise the ocean pattern would bleed through
   * their interior, since their own dedicated layers render `fill="none"`
   * until revealed), but these codes are rendered with no stroke, since
   * their border is instead drawn progressively by CountryPath/
   * NeighborsLayer on top. Showing a static stroke here would leak the
   * target's complete outline immediately, defeating the reveal mechanic.
   */
  excludeStrokeCodes: Set<CountryCode>;
  strokeWidth: number;
  /** World-space coordinates the radial reveal is centered on — the same point the zoom transform pivots around (the target). */
  centerX: number;
  centerY: number;
  /** World-space radius (in the same units as country paths) the reveal fades out over — grows as the player zooms out, so the "spotlight" widens along with the visible area. */
  revealRadius: number;
  /** 0–1: opacity at the very center of the gradient — 0 at default zoom (nothing shown yet), ramping toward 1 as the player zooms out. The gradient itself still fades spatially from this peak down to 0 at `revealRadius`. */
  peakOpacity: number;
}

/**
 * "Rest of the world" backdrop: every country's silhouette (opaque,
 * masking the ocean pattern beneath) plus a diagonally-hatched ocean
 * background, in the same shared-world coordinate frame as the
 * target/neighbors (see computeGeoScene). Geometry is static — the reveal
 * is a radial gradient mask centered on the target, not a flat opacity:
 * countries near the target fade in first/strongest, with the reveal
 * widening and intensifying as the player zooms out, culminating in the
 * whole world visible once fully zoomed out.
 */
export function WorldMapLayer({
  countries,
  excludeStrokeCodes,
  strokeWidth,
  centerX,
  centerY,
  revealRadius,
  peakOpacity,
}: WorldMapLayerProps) {
  return (
    <>
      <defs>
        <pattern
          id={OCEAN_HATCH_ID}
          width={OCEAN_HATCH_TILE}
          height={OCEAN_HATCH_TILE}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1={0} y1={0} x2={0} y2={OCEAN_HATCH_TILE} stroke={OCEAN_LINE_COLOR} strokeWidth={OCEAN_HATCH_LINE_WIDTH} />
        </pattern>
        <radialGradient id={REVEAL_GRADIENT_ID} gradientUnits="userSpaceOnUse" cx={centerX} cy={centerY} r={Math.max(revealRadius, 1)}>
          <stop offset="0%" stopColor="#fff" stopOpacity={peakOpacity} />
          <stop offset="55%" stopColor="#fff" stopOpacity={peakOpacity * 0.6} />
          <stop offset="100%" stopColor="#fff" stopOpacity={0} />
        </radialGradient>
        <mask id={REVEAL_MASK_ID} maskUnits="userSpaceOnUse" x={HATCH_X} y={HATCH_Y} width={HATCH_WIDTH} height={HATCH_HEIGHT}>
          <rect x={HATCH_X} y={HATCH_Y} width={HATCH_WIDTH} height={HATCH_HEIGHT} fill={`url(#${REVEAL_GRADIENT_ID})`} />
        </mask>
      </defs>
      <g data-testid="world-map-layer" mask={`url(#${REVEAL_MASK_ID})`}>
        <rect x={HATCH_X} y={HATCH_Y} width={HATCH_WIDTH} height={HATCH_HEIGHT} fill={`url(#${OCEAN_HATCH_ID})`} />
        {Object.entries(countries).map(([code, country]) => (
          <path
            key={code}
            d={country.path}
            fill={LAND_MASK_COLOR}
            stroke={excludeStrokeCodes.has(code) ? "none" : WORLD_COLOR}
            strokeWidth={strokeWidth}
          />
        ))}
      </g>
    </>
  );
}
