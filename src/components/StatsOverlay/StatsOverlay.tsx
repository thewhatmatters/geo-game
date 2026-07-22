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
 * Keyboard: Escape closes; initial focus lands on CLOSE so Tab order starts
 * inside the dialog; focus returns to the opener on unmount.
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

export function StatsOverlay({
  ledger,
  trophyMap = {},
  today,
  saveCode,
  onImportCode,
  onClose,
}: StatsOverlayProps) {
  const reduceMotion = useReducedMotion();
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const grid = useMemo(
    () => buildHeatmap(ledger, today, FULL_HISTORY_WEEKS),
    [ledger, today],
  );
  const totals = useMemo(() => heatmapTotals(grid), [grid]);

  // Escape closes; focus enters on CLOSE and restores on unmount so keyboard
  // users aren't stranded on a detached node when the overlay goes away.
  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previousFocusRef.current?.focus?.();
    };
  }, [onClose]);

  return (
    <motion.div
      className="stats-overlay"
      data-testid="stats-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Full result history"
      initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.22, ease: "easeOut" }}
    >
      <motion.div
        className="stats-overlay__panel"
        initial={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
        transition={{ duration: reduceMotion ? 0 : 0.26, ease: "easeOut" }}
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
          ref={closeRef}
          type="button"
          className="end-screen__copy"
          data-testid="stats-overlay-close"
          onClick={onClose}
        >
          CLOSE
        </button>
      </motion.div>
    </motion.div>
  );
}
