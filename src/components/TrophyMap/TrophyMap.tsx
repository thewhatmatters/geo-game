import { memo, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import type { Country, CountryCode } from "../../lib/game/dailyCountry";
import { WORLD_WIDTH, worldExtentY } from "../../lib/geo/scene";
import {
  LEGEND_STATES,
  STATE_LABEL,
  buildTrophyMap,
  progressLabel,
  trophySummary,
  type TrophyCountry,
} from "../../lib/stats/trophyMap";
import type { TrophyMapEntry } from "../../lib/storage/outcomes";

/**
 * Trophy world map (US-018) — the collection that grows out of daily plays.
 *
 * Reuses the round view's projection pipeline: the same pre-projected
 * country paths from the country dataset, in the same world coordinate
 * frame, framed here at a fixed full-world viewBox (lib/geo/scene's
 * WORLD_WIDTH × the effective data extent — no dead polar band). It is NOT
 * WorldMapLayer: that layer exists to be revealed progressively by the
 * round's zoom mask and tiles itself 3× for the antimeridian wrap, neither
 * of which a static, always-fully-visible trophy view wants.
 *
 * Tiering comes straight from the save's trophy map — bright green for an
 * in-time solve, dim yellow for a late one, unfilled for everything not yet
 * solved, so the base map stays readable and the empty space stays honest.
 *
 * Tooltip/tap follows the Heatmap's pattern: solved countries are focusable
 * <path role="button"> elements that write a live readout line (the half of
 * "hover or tap" that works on touch, where `title` never appears), while
 * every country — solved or not — carries a native <title> tooltip.
 */

export interface TrophyMapProps {
  /** Every country, keyed by code (see getAllCountries). */
  countries: Record<CountryCode, Country>;
  /** The persisted trophy map — country code → tier + solve date. */
  trophyMap: Record<string, TrophyMapEntry>;
  /** Today's freshly-solved country, if any: its fill animates in on mount. */
  highlightCode?: CountryCode | null;
  showLegend?: boolean;
  label?: string;
}

const extent = worldExtentY();
const VIEW_BOX = `0 ${extent.top} ${WORLD_WIDTH} ${extent.height}`;

/**
 * Locator-dot radius in world units (the viewBox spans WORLD_WIDTH = 4000),
 * sized to read at ~2–5 screen px across the two places this renders — the
 * compact end-screen card and the wider stats overlay.
 */
const MARKER_RADIUS = 28;

function TrophyMapImpl({
  countries,
  trophyMap,
  highlightCode = null,
  showLegend = true,
  label = "Solved countries world map",
}: TrophyMapProps) {
  const model = useMemo(() => buildTrophyMap(countries, trophyMap), [countries, trophyMap]);
  const [selected, setSelected] = useState<TrophyCountry | null>(null);

  return (
    <div className="trophy-map" data-testid="trophy-map">
      <svg
        className="trophy-map__svg"
        viewBox={VIEW_BOX}
        role="group"
        aria-label={label}
        data-testid="trophy-map-svg"
      >
        {model.countries.map((country) => {
          const summary = trophySummary(country);
          const solved = country.state !== "unsolved";
          const isNew = solved && country.code === highlightCode;
          // A micro-country's own shape is sub-pixel here, so its locator
          // dot — not the path — is what the player sees, hovers and taps.
          const shape = country.marker ? (
            <circle
              className={"trophy-map__marker" + (isNew ? " trophy-map__marker--new" : "")}
              cx={country.marker.x}
              cy={country.marker.y}
              r={MARKER_RADIUS}
            />
          ) : (
            <path
              className={"trophy-map__country" + (isNew ? " trophy-map__country--new" : "")}
              d={country.path}
            />
          );
          return (
            <g
              key={country.code}
              className="trophy-map__shape"
              data-code={country.code}
              data-state={country.state}
              {...(isNew ? { "data-new": "true" } : {})}
              {...(solved
                ? {
                    role: "button",
                    tabIndex: 0,
                    "aria-label": summary,
                    onClick: () => setSelected(country),
                    onFocus: () => setSelected(country),
                    // An SVG <g role="button"> gets none of a real button's
                    // key handling for free — Enter/Space have to be wired
                    // by hand or the map is mouse/touch-only.
                    onKeyDown: (event: KeyboardEvent<SVGGElement>) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      setSelected(country);
                    },
                  }
                : {})}
            >
              {shape}
              <title>{summary}</title>
            </g>
          );
        })}
      </svg>

      <p className="trophy-map__progress" data-testid="trophy-map-progress">
        <span className="trophy-map__progress-value">{progressLabel(model)}</span>
        <span className="trophy-map__progress-label">COUNTRIES CLAIMED</span>
      </p>

      {/* Live readout — the touch half of "hover or tap"; also what a
          keyboard focus announces as it moves through solved countries. */}
      <p className="trophy-map__readout" data-testid="trophy-map-readout" aria-live="polite">
        {selected ? trophySummary(selected) : "Tap a filled country for its solve"}
      </p>

      {showLegend && (
        <ul className="trophy-map__legend" data-testid="trophy-map-legend">
          {LEGEND_STATES.map((state) => (
            <li className="trophy-map__legend-item" key={state}>
              <span className="trophy-map__swatch" data-state={state} aria-hidden="true" />
              {STATE_LABEL[state]}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Memoized: the end screen re-renders every second (next-round countdown)
 * and this subtree is ~190 paths. Its props are all stable references
 * (module-level country dataset, the save's trophyMap object), so the map
 * paints once per outcome change instead of once per tick.
 */
export const TrophyMap = memo(TrophyMapImpl);
