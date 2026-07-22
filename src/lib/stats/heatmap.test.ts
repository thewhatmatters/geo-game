import { describe, expect, it } from "vitest";
import {
  COMPACT_WEEKS,
  DAYS_PER_WEEK,
  FULL_HISTORY_WEEKS,
  addDays,
  buildHeatmap,
  cellSummary,
  dayOfWeek,
  heatmapTotals,
  monthLabels,
} from "./heatmap";
import type { LedgerEntry } from "../storage/outcomes";

/** A Tuesday. */
const TODAY = "2026-07-21";

function ledger(entries: Record<string, LedgerEntry>): Record<string, LedgerEntry> {
  return entries;
}

function cellAt(
  grid: ReturnType<typeof buildHeatmap>,
  date: string,
) {
  for (const week of grid.weeks) {
    for (const cell of week) if (cell.date === date) return cell;
  }
  return undefined;
}

describe("buildHeatmap", () => {
  it("lays out N week columns of 7 day rows ending in today's week", () => {
    const grid = buildHeatmap({}, TODAY, COMPACT_WEEKS);
    expect(grid.weeks).toHaveLength(COMPACT_WEEKS);
    for (const week of grid.weeks) expect(week).toHaveLength(DAYS_PER_WEEK);
    // Columns start Sunday, end Saturday.
    expect(dayOfWeek(grid.start)).toBe(0);
    expect(dayOfWeek(grid.end)).toBe(6);
    // Last column contains today.
    expect(grid.weeks[COMPACT_WEEKS - 1].some((c) => c.date === TODAY)).toBe(true);
    // Rows are day-of-week consistent across columns.
    grid.weeks.forEach((week) => week.forEach((cell, row) => {
      expect(dayOfWeek(cell.date)).toBe(row);
    }));
  });

  it("spans a 12-month trailing window at full history", () => {
    const grid = buildHeatmap({}, TODAY, FULL_HISTORY_WEEKS);
    expect(grid.weeks).toHaveLength(FULL_HISTORY_WEEKS);
    // 53 weeks back covers at least a full year.
    expect(grid.start <= addDays(TODAY, -364)).toBe(true);
  });

  it("renders an empty ledger as missed cells, with no play data", () => {
    const grid = buildHeatmap({}, TODAY, COMPACT_WEEKS);
    const past = grid.weeks.flat().filter((c) => c.date <= TODAY);
    expect(past.length).toBeGreaterThan(0);
    expect(past.every((c) => c.state === "missed")).toBe(true);
    expect(past.every((c) => c.score === null && c.target === null)).toBe(true);
  });

  it("marks days after today as future, not as misses", () => {
    const grid = buildHeatmap({}, TODAY, COMPACT_WEEKS);
    const tomorrow = addDays(TODAY, 1);
    expect(cellAt(grid, tomorrow)?.state).toBe("future");
    expect(cellAt(grid, TODAY)?.state).toBe("missed");
    expect(heatmapTotals(grid).future).toBe(4); // Wed–Sat of today's week
  });

  it("maps each ledger outcome onto its own cell state", () => {
    const grid = buildHeatmap(
      ledger({
        [TODAY]: { outcome: "solved", score: 820, target: "ISL" },
        [addDays(TODAY, -1)]: { outcome: "solved_late", score: 310, target: "PER" },
        [addDays(TODAY, -2)]: { outcome: "failed", score: 0, target: "TUV" },
        [addDays(TODAY, -3)]: { outcome: "frozen", score: 0, target: "" },
      }),
      TODAY,
      COMPACT_WEEKS,
    );

    expect(cellAt(grid, TODAY)).toMatchObject({ state: "solved", score: 820, target: "ISL" });
    expect(cellAt(grid, addDays(TODAY, -1))).toMatchObject({
      state: "solved_late",
      score: 310,
    });
    // A failure keeps its own state and reports no score (it scores zero by design).
    expect(cellAt(grid, addDays(TODAY, -2))).toMatchObject({ state: "failed", score: null });
    expect(cellAt(grid, addDays(TODAY, -3))).toMatchObject({ state: "frozen", score: null });
    // Missed days stay distinguishable from every played state.
    expect(cellAt(grid, addDays(TODAY, -4))?.state).toBe("missed");
  });

  it("ignores ledger entries outside the window", () => {
    const grid = buildHeatmap(
      ledger({ "2020-01-01": { outcome: "solved", score: 900, target: "FRA" } }),
      TODAY,
      COMPACT_WEEKS,
    );
    expect(heatmapTotals(grid).solved).toBe(0);
  });
});

describe("heatmapTotals", () => {
  it("counts every state honestly, wins and losses alike", () => {
    const grid = buildHeatmap(
      ledger({
        [TODAY]: { outcome: "solved", score: 820, target: "ISL" },
        [addDays(TODAY, -1)]: { outcome: "failed", score: 0, target: "TUV" },
        [addDays(TODAY, -2)]: { outcome: "failed", score: 0, target: "PER" },
        [addDays(TODAY, -3)]: { outcome: "frozen", score: 0, target: "" },
      }),
      TODAY,
      COMPACT_WEEKS,
    );
    const totals = heatmapTotals(grid);
    expect(totals.solved).toBe(1);
    expect(totals.failed).toBe(2);
    expect(totals.frozen).toBe(1);
    expect(totals.solved + totals.solved_late + totals.failed + totals.frozen + totals.missed + totals.future)
      .toBe(COMPACT_WEEKS * DAYS_PER_WEEK);
  });
});

describe("cellSummary", () => {
  it("includes date, outcome and score for a solve", () => {
    expect(
      cellSummary({ date: TODAY, state: "solved", score: 820, target: "ISL" }),
    ).toBe("2026-07-21 · Solved in time · 820 pts");
    expect(
      cellSummary({ date: TODAY, state: "solved_late", score: 310, target: "PER" }),
    ).toBe("2026-07-21 · Solved late · 310 pts");
  });

  it("omits the score where there is none to report", () => {
    expect(cellSummary({ date: TODAY, state: "failed", score: null, target: "TUV" }))
      .toBe("2026-07-21 · Failed");
    expect(cellSummary({ date: TODAY, state: "missed", score: null, target: null }))
      .toBe("2026-07-21 · No play");
    expect(cellSummary({ date: TODAY, state: "frozen", score: null, target: null }))
      .toBe("2026-07-21 · Freeze covered");
  });
});

describe("monthLabels", () => {
  it("ticks once per month, in column order", () => {
    const grid = buildHeatmap({}, TODAY, FULL_HISTORY_WEEKS);
    const ticks = monthLabels(grid);
    expect(ticks.length).toBeGreaterThanOrEqual(12);
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i].weekIndex).toBeGreaterThan(ticks[i - 1].weekIndex);
      expect(ticks[i].label).not.toBe(ticks[i - 1].label);
    }
  });

  it("drops a leading sliver column that a second label immediately follows", () => {
    // 2026-07-21's grid start is a Sunday; whichever month it lands in, no
    // two ticks may share a column.
    const grid = buildHeatmap({}, TODAY, COMPACT_WEEKS);
    const ticks = monthLabels(grid);
    const columns = new Set(ticks.map((t) => t.weekIndex));
    expect(columns.size).toBe(ticks.length);
  });
});

describe("date helpers", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29"); // leap year
  });

  it("reads Sunday as row 0", () => {
    expect(dayOfWeek("2026-07-19")).toBe(0);
    expect(dayOfWeek("2026-07-21")).toBe(2);
    expect(dayOfWeek("2026-07-25")).toBe(6);
  });
});
