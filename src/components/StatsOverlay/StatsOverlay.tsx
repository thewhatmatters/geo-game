import { useEffect, useMemo, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Heatmap } from "../Heatmap";
import { TrophyMap } from "../TrophyMap";
import {
  FULL_HISTORY_WEEKS,
  buildHeatmap,
  heatmapTotals,
} from "../../lib/stats/heatmap";
import { SaveCode, type SaveCodeImportResult } from "../SaveCode";
import { getAllCountries } from "../../lib/game/dailyCountry";
import type { LedgerEntry, TrophyMapEntry } from "../../lib/storage/outcomes";

/**
 * Stats view (US-017) — the full 12-month trailing history.
 *
 * Reached as an OVERLAY from the end screen's "FULL HISTORY" button rather
 * than a route: the app is a single fixed-viewport surface with no router,
 * and an overlay keeps the post-round map exploration underneath intact.
 *
 * Being an overlay rather than a route is exactly why it has to do the
 * dialog work itself (US-020): Escape and a backdrop click close it, focus
 * moves into the panel on open and returns to whatever opened it on close,
 * and Tab is kept inside the panel while it's up.
 */

export interface StatsOverlayProps {
  ledger: Record<string, LedgerEntry>;
  /** US-018 — the trophy map, shown full-size here alongside the history grid. */
  trophyMap?: Record<string, TrophyMapEntry>;
  /** Boot date — the grid's last real day (see lib/game/boot). */
  today: string;
  /** US-019 — the full player state as a code; the panel is omitted without it. */
  saveCode?: string;
  /** US-019 — validates + applies a pasted code, returning the player-facing message. */
  onImportCode?: (code: string) => SaveCodeImportResult;
  onClose: () => void;
}

/** Module-level and immutable — a stable reference, so TrophyMap's memo holds. */
const ALL_COUNTRIES = getAllCountries();

/** Everything that can hold focus inside the panel, in DOM order. */
const FOCUSABLE =
  'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])';

export function StatsOverlay({
  ledger,
  trophyMap = {},
  today,
  saveCode,
  onImportCode,
  onClose,
}: StatsOverlayProps) {
  const grid = useMemo(
    () => buildHeatmap(ledger, today, FULL_HISTORY_WEEKS),
    [ledger, today],
  );
  const totals = useMemo(() => heatmapTotals(grid), [grid]);
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);

  // Open: park focus on the panel itself (not the first control, which would
  // start the reader mid-content). Close: hand it back to the button that
  // opened this, so Tab resumes where the player left off.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => previouslyFocused?.focus?.();
  }, []);

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hasAttribute("disabled"),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      // Wrap at both ends — without this, Tab walks out of the overlay and
      // into the round surface still rendered underneath it.
      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [onClose]);

  return (
    <motion.div
      className="stats-overlay"
      data-testid="stats-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Full result history"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
      /* Click-outside closes; the panel stops the bubble so a click on
         (or a text selection inside) the history itself never does. */
      onClick={onClose}
    >
      <motion.div
        className="stats-overlay__panel"
        ref={panelRef}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 8, scale: 0.99 }}
        transition={{ duration: reduceMotion ? 0 : 0.24, ease: "easeOut" }}
      >
        <p className="end-screen__kicker" aria-hidden="true">
          // RECORD — 12 MONTHS
        </p>
        <Heatmap grid={grid} showMonths showLegend label="Full result history" />
        <p className="stats-overlay__totals" data-testid="stats-overlay-totals">
          <span>{totals.solved} in time</span>
          <span>{totals.solved_late} late</span>
          <span>{totals.failed} failed</span>
          <span>{totals.frozen} frozen</span>
          <span>{totals.missed} missed</span>
        </p>
        <p className="end-screen__kicker" aria-hidden="true">
          // TERRITORY — TROPHY MAP
        </p>
        <TrophyMap countries={ALL_COUNTRIES} trophyMap={trophyMap} />
        {/* US-019 — backup lives with the history it protects, not in a
            separate settings surface the app doesn't have. */}
        {saveCode && onImportCode ? (
          <SaveCode code={saveCode} onImport={onImportCode} />
        ) : null}
        <button
          type="button"
          className="end-screen__copy"
          data-testid="stats-overlay-close"
          onClick={onClose}
        >
          CLOSE <span aria-hidden="true">(ESC)</span>
        </button>
      </motion.div>
    </motion.div>
  );
}
