import type { LedgerEntry, LedgerOutcome } from "../storage/outcomes";

/**
 * Contribution-heatmap model (US-017) — the honest ledger view.
 *
 * Pure derivation: ledger in, grid out. Everything date-shaped here runs in
 * UTC (same convention as lib/streak) so a grid never gains or loses a
 * column across a DST boundary; the *identity* of a day still comes from the
 * boot seam's local YYYY-MM-DD string, which is what the ledger is keyed by.
 *
 * Columns are weeks (oldest → newest, left → right), rows are days of the
 * week (Sunday → Saturday), one cell per date — GitHub's shape, because
 * it's the one grid players already know how to read.
 */

/** A ledger outcome, plus the two states the ledger can't record. */
export type HeatmapState = LedgerOutcome | "missed" | "future";

export interface HeatmapCell {
  /** Local YYYY-MM-DD — the same key the ledger uses. */
  date: string;
  state: HeatmapState;
  /** Solves only; null everywhere else (a failed round scores zero by design). */
  score: number | null;
  /** Country code played that day, when there was one. */
  target: string | null;
}

export interface HeatmapGrid {
  /** Week columns, oldest first; each is exactly 7 cells, Sunday → Saturday. */
  weeks: HeatmapCell[][];
  /** First and last date in the grid (inclusive), including padding days. */
  start: string;
  end: string;
}

export const DAYS_PER_WEEK = 7;

/** End-screen embed: a recent window that fits the panel without scrolling. */
export const COMPACT_WEEKS = 12;

/** Stats view: a 12-month trailing history (53 columns covers a full year plus the partial current week). */
export const FULL_HISTORY_WEEKS = 53;

/**
 * Glyphs carry the state independently of color (colorblind-safe): failed
 * and frozen are never told apart by hue alone. Solved is the plain filled
 * cell — the "good" default needs no mark.
 */
export const STATE_GLYPH: Record<HeatmapState, string> = {
  solved: "",
  solved_late: "·",
  failed: "✕",
  frozen: "❄",
  missed: "",
  future: "",
};

export const STATE_LABEL: Record<HeatmapState, string> = {
  solved: "Solved in time",
  solved_late: "Solved late",
  failed: "Failed",
  frozen: "Freeze covered",
  missed: "No play",
  future: "Upcoming",
};

/** Legend order — reads worst-to-best left to right, mirroring the grid's honesty. */
export const LEGEND_STATES: HeatmapState[] = [
  "solved",
  "solved_late",
  "failed",
  "frozen",
  "missed",
];

const MS_PER_DAY = 86_400_000;
const MONTH_LABELS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

function parseDay(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function formatDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Calendar-day arithmetic on a YYYY-MM-DD string (negative `days` goes back). */
export function addDays(date: string, days: number): string {
  return formatDay(parseDay(date) + days * MS_PER_DAY);
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(date: string): number {
  return new Date(parseDay(date)).getUTCDay();
}

function cellFor(date: string, entry: LedgerEntry | undefined, endDate: string): HeatmapCell {
  if (!entry) {
    return {
      date,
      state: date > endDate ? "future" : "missed",
      score: null,
      target: null,
    };
  }
  const isSolve = entry.outcome === "solved" || entry.outcome === "solved_late";
  return {
    date,
    state: entry.outcome,
    score: isSolve ? entry.score : null,
    target: entry.target || null,
  };
}

/**
 * Builds the trailing grid ending in the week that contains `endDate`.
 * The last column is padded out to Saturday with `future` cells so every
 * column is a full week — days that haven't happened yet are shown as
 * upcoming, never as a miss the player is on the hook for.
 */
export function buildHeatmap(
  ledger: Record<string, LedgerEntry>,
  endDate: string,
  weeks: number = FULL_HISTORY_WEEKS,
): HeatmapGrid {
  const lastDay = addDays(endDate, DAYS_PER_WEEK - 1 - dayOfWeek(endDate));
  const firstDay = addDays(lastDay, -(weeks * DAYS_PER_WEEK - 1));

  const columns: HeatmapCell[][] = [];
  let cursor = firstDay;
  for (let w = 0; w < weeks; w++) {
    const column: HeatmapCell[] = [];
    for (let d = 0; d < DAYS_PER_WEEK; d++) {
      column.push(cellFor(cursor, ledger[cursor], endDate));
      cursor = addDays(cursor, 1);
    }
    columns.push(column);
  }

  return { weeks: columns, start: firstDay, end: lastDay };
}

/** Tooltip / tap readout: date, outcome, and score for solves. */
export function cellSummary(cell: HeatmapCell): string {
  const parts = [cell.date, STATE_LABEL[cell.state]];
  if (cell.score !== null) parts.push(`${cell.score} pts`);
  return parts.join(" · ");
}

/** Per-state counts over the whole grid; `future` cells are never counted. */
export function heatmapTotals(grid: HeatmapGrid): Record<HeatmapState, number> {
  const totals: Record<HeatmapState, number> = {
    solved: 0,
    solved_late: 0,
    failed: 0,
    frozen: 0,
    missed: 0,
    future: 0,
  };
  for (const week of grid.weeks) {
    for (const cell of week) totals[cell.state] += 1;
  }
  return totals;
}

export interface MonthTick {
  /** Index into `grid.weeks` the label sits above. */
  weekIndex: number;
  label: string;
}

/**
 * Month ticks for the column header — one per column whose Sunday starts a
 * new month, skipping a first column that would immediately be followed by
 * another label (a sliver of the previous month reads as noise).
 */
export function monthLabels(grid: HeatmapGrid): MonthTick[] {
  const ticks: MonthTick[] = [];
  let previousMonth = -1;
  grid.weeks.forEach((week, weekIndex) => {
    const month = new Date(parseDay(week[0].date)).getUTCMonth();
    if (month !== previousMonth) {
      previousMonth = month;
      ticks.push({ weekIndex, label: MONTH_LABELS[month] });
    }
  });
  if (ticks.length >= 2 && ticks[1].weekIndex <= 1) return ticks.slice(1);
  return ticks;
}
