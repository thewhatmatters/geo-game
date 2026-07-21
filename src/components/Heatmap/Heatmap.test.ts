import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Heatmap } from "./Heatmap";
import { COMPACT_WEEKS, DAYS_PER_WEEK, addDays, buildHeatmap } from "../../lib/stats/heatmap";
import type { LedgerEntry } from "../../lib/storage/outcomes";

const TODAY = "2026-07-21";

const FULL_LEDGER: Record<string, LedgerEntry> = {
  [TODAY]: { outcome: "solved", score: 820, target: "ISL" },
  [addDays(TODAY, -1)]: { outcome: "solved_late", score: 310, target: "PER" },
  [addDays(TODAY, -2)]: { outcome: "failed", score: 0, target: "TUV" },
  [addDays(TODAY, -3)]: { outcome: "frozen", score: 0, target: "" },
  // -4 is deliberately absent: a missed day.
};

function render(ledger: Record<string, LedgerEntry>, weeks = COMPACT_WEEKS): string {
  return renderToStaticMarkup(
    createElement(Heatmap, { grid: buildHeatmap(ledger, TODAY, weeks) }),
  );
}

function cellFor(html: string, date: string): string {
  const match = html.match(new RegExp(`<[^>]*data-date="${date}"[^>]*>`));
  expect(match, `no cell rendered for ${date}`).not.toBeNull();
  return match![0];
}

describe("Heatmap", () => {
  it("renders one cell per day in the window", () => {
    const html = render({});
    const cells = html.match(/data-date="/g) ?? [];
    expect(cells).toHaveLength(COMPACT_WEEKS * DAYS_PER_WEEK);
    expect(html).toContain('data-testid="heatmap-grid"');
  });

  it("renders an empty ledger as inert missed cells", () => {
    const html = render({});
    expect(cellFor(html, addDays(TODAY, -10))).toContain('data-state="missed"');
    // Nothing played means nothing focusable.
    expect(html).not.toContain("<button");
  });

  it("colors each outcome with its own cell state", () => {
    const html = render(FULL_LEDGER);
    expect(cellFor(html, TODAY)).toContain('data-state="solved"');
    expect(cellFor(html, addDays(TODAY, -1))).toContain('data-state="solved_late"');
    expect(cellFor(html, addDays(TODAY, -2))).toContain('data-state="failed"');
    expect(cellFor(html, addDays(TODAY, -3))).toContain('data-state="frozen"');
    expect(cellFor(html, addDays(TODAY, -4))).toContain('data-state="missed"');
    expect(cellFor(html, addDays(TODAY, 1))).toContain('data-state="future"');
  });

  it("distinguishes failed and frozen by glyph, not color alone", () => {
    const html = render(FULL_LEDGER);
    const failedIdx = html.indexOf('data-date="' + addDays(TODAY, -2) + '"');
    const frozenIdx = html.indexOf('data-date="' + addDays(TODAY, -3) + '"');
    // Glyph sits inside the cell that follows its data-date attribute.
    expect(html.slice(failedIdx, failedIdx + 200)).toContain("✕");
    expect(html.slice(frozenIdx, frozenIdx + 200)).toContain("❄");
  });

  it("gives every cell a tooltip with date, outcome and score", () => {
    const html = render(FULL_LEDGER);
    expect(cellFor(html, TODAY)).toContain('title="2026-07-21 · Solved in time · 820 pts"');
    expect(cellFor(html, addDays(TODAY, -1))).toContain(
      'title="2026-07-20 · Solved late · 310 pts"',
    );
    expect(cellFor(html, addDays(TODAY, -2))).toContain('title="2026-07-19 · Failed"');
    expect(cellFor(html, addDays(TODAY, -3))).toContain('title="2026-07-18 · Freeze covered"');
    expect(cellFor(html, addDays(TODAY, -4))).toContain('title="2026-07-17 · No play"');
  });

  it("makes played days tappable and labels them for screen readers", () => {
    const html = render(FULL_LEDGER);
    const solved = cellFor(html, TODAY);
    expect(solved).toContain("<button");
    expect(solved).toContain('aria-label="2026-07-21 · Solved in time · 820 pts"');
    // Missed days stay inert (no tab stop) but keep the tooltip.
    expect(cellFor(html, addDays(TODAY, -4))).not.toContain("<button");
    expect((html.match(/<button/g) ?? []).length).toBe(4);
  });

  it("shows the legend for all five recorded states", () => {
    const html = render(FULL_LEDGER);
    expect(html).toContain('data-testid="heatmap-legend"');
    for (const label of [
      "Solved in time",
      "Solved late",
      "Failed",
      "Freeze covered",
      "No play",
    ]) {
      expect(html).toContain(label);
    }
  });

  it("renders month ticks only when asked", () => {
    const withMonths = renderToStaticMarkup(
      createElement(Heatmap, {
        grid: buildHeatmap({}, TODAY, COMPACT_WEEKS),
        showMonths: true,
      }),
    );
    expect(withMonths).toContain("heatmap__months");
    expect(render({})).not.toContain("heatmap__months");
  });
});
