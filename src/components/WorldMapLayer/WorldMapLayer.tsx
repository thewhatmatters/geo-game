import { memo } from "react";
import type { Country, CountryCode } from "../../lib/game/dailyCountry";
import { ZOOM_MIN, ZOOM_STEP } from "../../lib/game/zoom";
import { WORLD_WIDTH, worldExtentY } from "../../lib/geo/scene";

/** Fainter than NEIGHBOR_COLOR — this is tertiary background context, not something the player needs to read. Layered underneath the radial reveal mask in App.tsx (which multiplies this down further), so the base alpha needs headroom to still be legible during the gradual mid-zoom reveal, not just once fully zoomed out. */
const WORLD_COLOR = "rgba(255, 255, 255, 0.4)";
/**
 * Deliberately strong for a background texture: when the target sits in
 * open ocean (no neighbor landmasses anywhere near), this hatch is the ONLY
 * thing a paid zoom-out step reveals, so each step's opacity ramp
 * (WORLD_REVEAL_OPACITY_ZOOM_SPAN in App.tsx) has to produce an obvious
 * delta — at the old 0.22 a step barely registered. The radial reveal mask
 * multiplies it down further mid-reveal.
 */
const OCEAN_LINE_COLOR = "rgba(255, 255, 255, 0.55)";
/** Matches the page background (index.css `body { background: #000; }`) — masks the ocean hatch under actual landmasses. Without an opaque fill here, the ocean rect (which spans the whole world, not just literal water) would bleed through every country's interior, not just true gaps between them. */
const LAND_MASK_COLOR = "#000";

/**
 * Seamless horizontal wrap: the whole world tile (hatch + graticule +
 * countries) renders once as a <g id>, then twice more via <use> at
 * ±WORLD_WIDTH. The projection's x axis is linear in longitude, so a
 * one-world-width translate IS the antimeridian wrap — countries split at
 * ±180° (Russia, Fiji) visually rejoin across the seam, and panning/zoom
 * near the date line shows continuous ocean instead of a hard edge into
 * void. Vertically there is no wrap (poles are real edges); the zoom
 * ceiling (scene.ts height-fit maxZoom) + App's clampWorldCenterY keep the
 * viewport inside the world's height instead.
 */
const WORLD_TILE_ID = "world-tile";
/**
 * The hatch spans exactly one world tile horizontally (copies abut
 * seamlessly; any margin would double-expose the pattern at seams) and the
 * EFFECTIVE data extent vertically (see scene.ts worldExtentY) — hatch
 * past Antarctica's real bottom edge reads as a dead padding band when
 * fully zoomed out.
 */
const HATCH_X = 0;
const HATCH_Y = worldExtentY().top;
const HATCH_WIDTH = WORLD_WIDTH;
const HATCH_HEIGHT = worldExtentY().height;

const OCEAN_HATCH_ID = "ocean-hatch";
/** Tile size (world units) and line thickness for the ocean hatch — smaller tile = tighter-packed diagonal lines. */
const OCEAN_HATCH_TILE = 7;
const OCEAN_HATCH_LINE_WIDTH = 1.25;
/**
 * By two zoom-out steps the hatch has reached its calmest treatment. The
 * tile grows with zoom first (counteracting the map's scale-down, which
 * otherwise packs more lines into every screen pixel), then another 60%,
 * while the lines fade modestly. This keeps the vector hatch legible at a
 * world reveal without turning it into a gray field of line noise.
 */
const HATCH_DENSITY_ZOOM_SPAN = ZOOM_STEP * 2;
const HATCH_MAX_EXTRA_SPACING = 0.6;
const HATCH_MIN_OPACITY = 0.42;

/**
 * Graticule (lat/long grid) — pure math lines carrying zero country
 * information, revealed by the same radial mask as everything else. In
 * empty-ocean scenes it gives each paid zoom step a second, structural
 * "you bought map context" cue on top of the hatch: lines sweep into frame
 * as the reveal widens. Spacing is in degrees of the equirectangular
 * projection (world width 4000 = 360°). Drawn UNDER the land-mask paths so
 * it reads as ocean texture, leaving landmass silhouettes clean.
 */
const GRATICULE_STEP_DEGREES = 10;
const GRATICULE_COLOR = "rgba(255, 255, 255, 0.3)";
/** On-screen px via vector-effect="non-scaling-stroke" — world-unit strokes either balloon at low zoom or vanish at full zoom-out, and a hairline at every zoom is the classic chart look. */
const GRATICULE_LINE_WIDTH_PX = 1;

const GRATICULE_STEP = (WORLD_WIDTH / 360) * GRATICULE_STEP_DEGREES;
// No +1 on the meridians: the x=WORLD_WIDTH line is the NEXT tile's x=0 —
// including both would double-draw (brighter) exactly at the wrap seam.
const GRATICULE_XS = Array.from(
  { length: Math.floor(360 / GRATICULE_STEP_DEGREES) },
  (_, i) => i * GRATICULE_STEP,
);
// Parallels stay on the true 10°-grid positions but only those inside the
// effective data extent are drawn — a grid line floating in the dead band
// past Antarctica would reintroduce the padding the extent clamp removes.
const GRATICULE_YS = Array.from(
  { length: Math.floor(180 / GRATICULE_STEP_DEGREES) + 1 },
  (_, i) => i * GRATICULE_STEP,
).filter((y) => y >= worldExtentY().top && y <= worldExtentY().bottom);

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
  /** Current ambient zoom multiplier; used only to calm hatch spacing/alpha as more of the world enters the viewport. */
  zoom: number;
  /** World units per screen pixel at default zoom (scene.pxScale). */
  worldUnitsPerPixel: number;
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
function WorldMapLayerImpl({
  countries,
  excludeStrokeCodes,
  strokeWidth,
  centerX,
  centerY,
  revealRadius,
  peakOpacity,
  zoom,
  worldUnitsPerPixel,
}: WorldMapLayerProps) {
  const hatchZoomProgress = Math.min(1, Math.max(0, (zoom - ZOOM_MIN) / HATCH_DENSITY_ZOOM_SPAN));
  // pxScale converts the desired on-screen spacing to world units. The
  // ambient map transform then divides by zoom, so multiplying by zoom here
  // keeps density stable before the extra calming factor is applied.
  const hatchTile = OCEAN_HATCH_TILE * worldUnitsPerPixel * zoom * (1 + HATCH_MAX_EXTRA_SPACING * hatchZoomProgress);
  const hatchOpacity = 1 - (1 - HATCH_MIN_OPACITY) * hatchZoomProgress;
  return (
    <>
      <defs>
        <pattern
          id={OCEAN_HATCH_ID}
          width={hatchTile}
          height={hatchTile}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          {/* Motion lives entirely in CSS; React only recalculates density
              when zoom itself changes. Keeping the original single line
              also retains Chromium's reliable SVG-pattern paint path. */}
          <g opacity={hatchOpacity}>
            <line className="ocean-hatch__flow" x1={0} y1={0} x2={0} y2={hatchTile} stroke={OCEAN_LINE_COLOR} strokeWidth={OCEAN_HATCH_LINE_WIDTH * worldUnitsPerPixel * zoom} />
          </g>
        </pattern>
        <radialGradient id={REVEAL_GRADIENT_ID} gradientUnits="userSpaceOnUse" cx={centerX} cy={centerY} r={Math.max(revealRadius, 1)}>
          <stop offset="0%" stopColor="#fff" stopOpacity={peakOpacity} />
          <stop offset="55%" stopColor="#fff" stopOpacity={peakOpacity * 0.6} />
          <stop offset="100%" stopColor="#fff" stopOpacity={0} />
        </radialGradient>
        {/* Mask extent spans all three tiles; the single radial gradient
            (centered on the target) reaches whichever copy is on screen, so
            the reveal behaves identically across the wrap seam. */}
        <mask id={REVEAL_MASK_ID} maskUnits="userSpaceOnUse" x={-WORLD_WIDTH} y={HATCH_Y} width={WORLD_WIDTH * 3} height={HATCH_HEIGHT}>
          <rect x={-WORLD_WIDTH} y={HATCH_Y} width={WORLD_WIDTH * 3} height={HATCH_HEIGHT} fill={`url(#${REVEAL_GRADIENT_ID})`} />
        </mask>
      </defs>
      <g
        data-testid="world-map-layer"
        data-hatch-density={hatchZoomProgress.toFixed(2)}
        mask={`url(#${REVEAL_MASK_ID})`}
      >
        <g id={WORLD_TILE_ID}>
          <rect x={HATCH_X} y={HATCH_Y} width={HATCH_WIDTH} height={HATCH_HEIGHT} fill={`url(#${OCEAN_HATCH_ID})`} />
          <g data-testid="world-graticule" stroke={GRATICULE_COLOR} strokeWidth={GRATICULE_LINE_WIDTH_PX}>
            {GRATICULE_XS.map((x) => (
              <line key={`v${x}`} x1={x} y1={HATCH_Y} x2={x} y2={HATCH_Y + HATCH_HEIGHT} vectorEffect="non-scaling-stroke" />
            ))}
            {GRATICULE_YS.map((y) => (
              <line key={`h${y}`} x1={0} y1={y} x2={WORLD_WIDTH} y2={y} vectorEffect="non-scaling-stroke" />
            ))}
          </g>
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
        <use href={`#${WORLD_TILE_ID}`} x={-WORLD_WIDTH} />
        <use href={`#${WORLD_TILE_ID}`} x={WORLD_WIDTH} />
      </g>
    </>
  );
}

/**
 * Memoized (US-018): this is ~190 paths tiled 3× and it re-rendered on every
 * App render, including the once-a-second re-render the end screen's
 * next-round countdown triggers while the post-round map is still on screen.
 * All props are already stable references (module-level country dataset,
 * memoized exclusion Set, plain numbers), so the tile now repaints only when
 * the zoom/reveal values actually move.
 */
export const WorldMapLayer = memo(WorldMapLayerImpl);
