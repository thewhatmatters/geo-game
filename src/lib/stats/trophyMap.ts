import type { Country, CountryCode } from "../game/dailyCountry";
import { pathBounds } from "../geo/pathBounds";
import type { TrophyMapEntry } from "../storage/outcomes";

/**
 * Trophy-map model (US-018) — the collection view of the save's trophy map.
 *
 * Pure derivation, same shape of seam as lib/stats/heatmap: the persisted
 * `trophyMap` record plus the country dataset go in, a render-ready list of
 * every country (solved or not) comes out. The component decides nothing
 * about tiering; it only paints what this returns.
 *
 * Honest like the heatmap: every country in the dataset is present in the
 * output, so the unsolved majority is visible rather than hidden — the map
 * is a multi-year collection, and the empty space is the point.
 */

/** The two solve tiers the save records, plus the never-solved default. */
export type TrophyState = TrophyMapEntry["tier"] | "unsolved";

export interface TrophyCountry {
  code: CountryCode;
  name: string;
  /** Projected SVG path, in the same world frame as the round view (see lib/geo/scene). */
  path: string;
  state: TrophyState;
  /** Local YYYY-MM-DD the country was solved on; null when never solved. */
  date: string | null;
  /**
   * World-space locator dot for a SOLVED country too small to see at
   * whole-world scale; null for everything else (see MICRO_MARKER_MAX_SPAN).
   */
  marker: { x: number; y: number } | null;
}

/**
 * A solved country whose footprint spans less than this many world units
 * (the full world is WORLD_WIDTH = 4000 across) gets a locator dot instead
 * of relying on its own fill: Luxembourg, Singapore and every island
 * microstate render well under one screen pixel here, and an invisible
 * trophy is not a trophy. Unlike the round view — where true relative scale
 * IS the difficulty (see CLAUDE.md on micro-archipelago days) — this map's
 * whole job is showing what you've collected, so findability wins.
 */
export const MICRO_MARKER_MAX_SPAN = 60;

export interface TrophyMapModel {
  /** Every country in the dataset, unsolved first so solved fills paint on top of their neighbors. */
  countries: TrophyCountry[];
  inTime: number;
  late: number;
  /** inTime + late — the numerator of the progress counter. */
  solved: number;
  /** Countries in the dataset — the denominator ("N/190"). */
  total: number;
}

export const STATE_LABEL: Record<TrophyState, string> = {
  in_time: "Solved in time",
  late: "Solved late",
  unsolved: "Not yet solved",
};

/** Legend order — best tier first, then the state that dominates the map early on. */
export const LEGEND_STATES: TrophyState[] = ["in_time", "late", "unsolved"];

/**
 * Solved countries render last so a fill is never overdrawn by an unsolved
 * neighbor's silhouette; within each group, code order keeps the output
 * stable across runs (the dataset's key order is not guaranteed).
 */
const PAINT_ORDER: Record<TrophyState, number> = { unsolved: 0, late: 1, in_time: 1 };

/** Center of the path's bounds when it's too small to see; null otherwise. */
function microMarker(path: string): { x: number; y: number } | null {
  const bounds = pathBounds(path);
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
  if (!Number.isFinite(span) || span >= MICRO_MARKER_MAX_SPAN) return null;
  return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
}

export function buildTrophyMap(
  countries: Record<CountryCode, Country>,
  trophyMap: Record<string, TrophyMapEntry>,
): TrophyMapModel {
  const entries: TrophyCountry[] = Object.keys(countries)
    .sort()
    .map((code) => {
      const trophy = trophyMap[code];
      return {
        code,
        name: countries[code].name,
        path: countries[code].path,
        state: trophy ? trophy.tier : "unsolved",
        date: trophy ? trophy.date : null,
        // Only solved countries are measured — the unsolved majority never
        // draws a dot, so this stays one pathBounds pass per trophy.
        marker: trophy ? microMarker(countries[code].path) : null,
      };
    });
  entries.sort((a, b) => PAINT_ORDER[a.state] - PAINT_ORDER[b.state]);

  const inTime = entries.filter((entry) => entry.state === "in_time").length;
  const late = entries.filter((entry) => entry.state === "late").length;
  return {
    countries: entries,
    inTime,
    late,
    solved: inTime + late,
    total: entries.length,
  };
}

/** Tooltip / readout line: name, solve date and tier — everything a hover or tap has to answer. */
export function trophySummary(country: TrophyCountry): string {
  const label = STATE_LABEL[country.state];
  if (!country.date) return `${country.name} · ${label}`;
  return `${country.name} · ${country.date} · ${label}`;
}

export function progressLabel(model: TrophyMapModel): string {
  return `${model.solved}/${model.total}`;
}
