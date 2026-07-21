import { useState } from "react";
import {
  LEGEND_STATES,
  STATE_GLYPH,
  STATE_LABEL,
  cellSummary,
  monthLabels,
  type HeatmapCell,
  type HeatmapGrid,
} from "../../lib/stats/heatmap";

/**
 * Contribution heatmap (US-017) — the ledger rendered as a calendar grid.
 *
 * Honest by construction: it draws whatever the ledger holds, so failures
 * and missed days occupy the same real estate wins do. Every state is
 * readable without color (see STATE_GLYPH) — failed and frozen carry
 * glyphs, missed is the empty cell.
 *
 * Cells that record a played day are <button>s (tap → readout line, which
 * is how this works on touch, where `title` never appears); missed and
 * upcoming days are inert <div>s with the same tooltip. That split keeps the
 * tab order proportional to what the player actually did rather than making
 * a 53-week grid into 371 tab stops.
 */

export interface HeatmapProps {
  grid: HeatmapGrid;
  /** Column header with month ticks — worth the row on the full-history view only. */
  showMonths?: boolean;
  showLegend?: boolean;
  /** Accessible name for the grid region. */
  label?: string;
}

const WEEKDAY_ROWS = ["S", "M", "T", "W", "T", "F", "S"];

function isPlayed(cell: HeatmapCell): boolean {
  return cell.state !== "missed" && cell.state !== "future";
}

export function Heatmap({
  grid,
  showMonths = false,
  showLegend = true,
  label = "Daily result heatmap",
}: HeatmapProps) {
  const [selected, setSelected] = useState<HeatmapCell | null>(null);
  const columns = grid.weeks.length;
  const columnStyle = { gridTemplateColumns: `repeat(${columns}, 1fr)` };
  const ticks = showMonths ? monthLabels(grid) : [];

  return (
    <div className="heatmap" data-testid="heatmap">
      {showMonths && (
        <div className="heatmap__months" style={columnStyle} aria-hidden="true">
          {ticks.map((tick) => (
            <span
              key={`${tick.weekIndex}-${tick.label}`}
              className="heatmap__month"
              style={{ gridColumn: tick.weekIndex + 1 }}
            >
              {tick.label}
            </span>
          ))}
        </div>
      )}

      <div className="heatmap__body">
        <div className="heatmap__weekdays" aria-hidden="true">
          {WEEKDAY_ROWS.map((day, i) => (
            <span key={i} className="heatmap__weekday">
              {i % 2 === 1 ? day : ""}
            </span>
          ))}
        </div>

        <div
          className="heatmap__grid"
          style={columnStyle}
          role="group"
          aria-label={label}
          data-testid="heatmap-grid"
        >
          {grid.weeks.map((week, weekIndex) => (
            <div className="heatmap__week" key={weekIndex}>
              {week.map((cell) => {
                const summary = cellSummary(cell);
                const glyph = STATE_GLYPH[cell.state];
                const className = "heatmap__cell";
                if (!isPlayed(cell)) {
                  return (
                    <div
                      key={cell.date}
                      className={className}
                      data-state={cell.state}
                      data-date={cell.date}
                      title={summary}
                    />
                  );
                }
                return (
                  <button
                    type="button"
                    key={cell.date}
                    className={className}
                    data-state={cell.state}
                    data-date={cell.date}
                    title={summary}
                    aria-label={summary}
                    onClick={() => setSelected(cell)}
                  >
                    <span aria-hidden="true">{glyph}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Live readout — the touch-friendly half of "tooltip/tap". Falls back
          to the legend's job of naming the states when nothing is selected. */}
      <p className="heatmap__readout" data-testid="heatmap-readout" aria-live="polite">
        {selected ? cellSummary(selected) : "Tap a day for its result"}
      </p>

      {showLegend && (
        <ul className="heatmap__legend" data-testid="heatmap-legend">
          {LEGEND_STATES.map((state) => (
            <li className="heatmap__legend-item" key={state}>
              <span className="heatmap__cell" data-state={state} aria-hidden="true">
                {STATE_GLYPH[state]}
              </span>
              {STATE_LABEL[state]}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
