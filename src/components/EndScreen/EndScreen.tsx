import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { RoundStatus, ScoreEvent } from "../../lib/game/round";
import {
  buildScoreBreakdown,
  outcomeHeadline,
  type BreakdownLine,
} from "../../lib/game/scoreBreakdown";
import { countdownToNextRound } from "../../lib/game/nextRound";
import { Heatmap } from "../Heatmap";
import { StatsOverlay } from "../StatsOverlay";
import { TrophyMap } from "../TrophyMap";
import { COMPACT_WEEKS, buildHeatmap } from "../../lib/stats/heatmap";
import { getAllCountries, type CountryCode } from "../../lib/game/dailyCountry";
import type { LedgerEntry, TrophyMapEntry } from "../../lib/storage/outcomes";
import { prefersReducedMotion } from "../../lib/ui/motion";

/**
 * End screen — the post-round surface, in two acts.
 *
 * Act 1: Street-Fighter-style itemized score recap. Reads RoundCore's
 * score-event log via buildScoreBreakdown (no re-derivation). Lines cascade
 * in sequence with a terminal cadence (CSS entrance + staggered mount);
 * reduced-motion users get the full list at once.
 *
 * Act 2 (US-013): the handoff — share preview + copy, current streak, and a
 * live countdown to the next local-midnight round. This is the ONLY place
 * in the app with share/copy affordances; the round surface deliberately
 * has none (they'd be noise mid-round and a spoiler risk before the round
 * resolves). The stats strip is a grid sized to take more cells later —
 * freeze, heatmap and the played-countries map land in following stories.
 */

/** Delay between successive line reveals (ms). */
export const LINE_STAGGER_MS = 280;

/** How long the "COPIED" acknowledgement stays up before the button resets. */
export const COPY_FEEDBACK_MS = 1800;

/** Countdown refresh cadence — a whole-second readout only needs 1Hz. */
const COUNTDOWN_TICK_MS = 1000;

export interface EndScreenProps {
  status: RoundStatus;
  /** Event-sourced running total (floored), before time bonus / failure zero. */
  eventScore: number;
  scoreEvents: ScoreEvent[];
  remainingSeconds: number;
  dayNumber: number;
  /** Act 2 — the exact text the Copy button writes to the clipboard. */
  shareString: string;
  /** Act 2 — consecutive days solved (see lib/streak). */
  currentStreak: number;
  /** Act 2 — banked streak freezes (US-016). */
  freezes: number;
  /** Kind notice: freeze covered / earned / streak ended. */
  noticeMessage?: string | null;
  /** One-line freeze rule (Duolingo-style explainer). */
  freezeRuleCopy?: string;
  /** US-017 — the outcome ledger behind the heatmap; today's entry is already written by the time this mounts. */
  ledger?: Record<string, LedgerEntry>;
  /** US-018 — country code → solve tier + date, behind the trophy map. */
  trophyMap?: Record<string, TrophyMapEntry>;
  /** Today's country: its fill animates in when this screen opens on a solve. */
  targetCode?: CountryCode | null;
  /** Boot date — the heatmap's last real day. */
  today: string;
  /** US-019 — the full player state as a code, for the stats overlay's backup panel. */
  saveCode?: string;
  /** US-019 — validates + applies a pasted code, returning the player-facing message. */
  onImportCode?: (code: string) => { ok: boolean; message: string };
}

/** Module-level and immutable — a stable reference, so TrophyMap's memo holds. */
const ALL_COUNTRIES = getAllCountries();

function formatAmount(amount: number): string {
  if (amount > 0) return `+${amount}`;
  return `${amount}`;
}

function amountTone(line: BreakdownLine): "positive" | "negative" | "neutral" | "total" {
  if (line.key === "total") return "total";
  if (line.amount > 0) return "positive";
  if (line.amount < 0) return "negative";
  return "neutral";
}

/**
 * Live HH:MM:SS until the next local-midnight round. Reads the wall clock
 * (the one place post-round that has to) and re-samples every second rather
 * than counting down its own state, so a backgrounded tab resumes accurate.
 */
function useNextRoundCountdown(): string {
  const [countdown, setCountdown] = useState(() => countdownToNextRound(new Date()));
  useEffect(() => {
    const id = setInterval(() => setCountdown(countdownToNextRound(new Date())), COUNTDOWN_TICK_MS);
    return () => clearInterval(id);
  }, []);
  return countdown;
}

export function EndScreen({
  status,
  eventScore,
  scoreEvents,
  remainingSeconds,
  dayNumber,
  shareString,
  currentStreak,
  freezes,
  noticeMessage = null,
  freezeRuleCopy,
  ledger = {},
  trophyMap = {},
  targetCode = null,
  today,
  saveCode,
  onImportCode,
}: EndScreenProps) {
  const reduceMotion = useReducedMotion();
  const breakdown = useMemo(
    () =>
      buildScoreBreakdown({
        status,
        score: eventScore,
        scoreEvents,
        remainingSeconds,
      }),
    [status, eventScore, scoreEvents, remainingSeconds],
  );

  const headline = outcomeHeadline(status, dayNumber);
  const isSolve = status === "solved" || status === "solved_late";
  const isLockedOut = status === "locked_out";

  // Progressive reveal via staggered mount. Reduced-motion jumps straight
  // to the full list. CSS handles the entrance animation (transform/opacity
  // only) so the cascade doesn't depend on JS animation libraries.
  const [visibleCount, setVisibleCount] = useState(() =>
    prefersReducedMotion() ? breakdown.lines.length : 0,
  );

  useEffect(() => {
    if (prefersReducedMotion()) {
      setVisibleCount(breakdown.lines.length);
      return;
    }
    setVisibleCount(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    breakdown.lines.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleCount(i + 1), LINE_STAGGER_MS * (i + 1)));
    });
    return () => timers.forEach(clearTimeout);
  }, [breakdown.lines]);

  const countdown = useNextRoundCountdown();

  // "copied" acknowledges a successful write; "error" covers a browser that
  // denies clipboard access (insecure context, permission refused) — the
  // preview above stays selectable as the manual fallback either way.
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  useEffect(() => {
    if (copyState === "idle") return;
    const id = setTimeout(() => setCopyState("idle"), COPY_FEEDBACK_MS);
    return () => clearTimeout(id);
  }, [copyState]);

  // Compact recent window; today's cell is current because App records the
  // outcome before this screen mounts (see App's record effect).
  const compactGrid = useMemo(
    () => buildHeatmap(ledger, today, COMPACT_WEEKS),
    [ledger, today],
  );
  const [showStats, setShowStats] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareString);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }, [shareString]);

  const enter = reduceMotion
    ? { opacity: 1 }
    : { opacity: 0 };
  const entered = { opacity: 1 };
  const panelEnter = reduceMotion
    ? { opacity: 1, y: 0 }
    : { opacity: 0, y: 12 };
  const panelEntered = { opacity: 1, y: 0 };

  return (
    <motion.div
      className={`end-screen${isLockedOut ? " end-screen--locked-out" : ""}`}
      data-testid="end-screen"
      data-outcome={status}
      role="dialog"
      aria-modal="true"
      aria-label={headline}
      initial={enter}
      animate={entered}
      transition={{ duration: reduceMotion ? 0 : 0.28, ease: "easeOut" }}
    >
      <motion.div
        className="end-screen__panel"
        initial={panelEnter}
        animate={panelEntered}
        transition={{ duration: reduceMotion ? 0 : 0.32, ease: "easeOut" }}
      >
        <p
          className={`end-screen__headline${isSolve ? " end-screen__headline--granted" : " end-screen__headline--denied"}${isLockedOut ? " end-screen__headline--lockout" : ""}`}
          data-testid="end-screen-headline"
        >
          {headline}
        </p>
        <p className="end-screen__kicker" aria-hidden="true">
          // INTRUSION LOG — SCORE RECONSTITUTION
        </p>
        <ol className="end-screen__lines" data-testid="end-screen-lines">
          {breakdown.lines.map((line, index) => {
            if (index >= visibleCount) return null;
            const tone = amountTone(line);
            const isTotal = line.key === "total";
            return (
              <li
                key={line.key}
                className={
                  "end-screen__line" +
                  (isTotal ? " end-screen__line--total" : "") +
                  ` end-screen__line--${tone}`
                }
                data-testid={`end-screen-line-${line.key}`}
              >
                <span className="end-screen__label">
                  {line.label}
                  {line.context ? (
                    <span className="end-screen__context">{line.context}</span>
                  ) : null}
                </span>
                <span className="end-screen__dots" aria-hidden="true" />
                <span className="end-screen__amount">{formatAmount(line.amount)}</span>
              </li>
            );
          })}
        </ol>

        {/* ── Act 2 — the handoff ───────────────────────────────────────
            Share preview → copy → what you're coming back to. Sits below
            the recap so the score story lands first. */}
        <div className="end-screen__act2" data-testid="end-screen-act2">
          <p className="end-screen__kicker" aria-hidden="true">
            // TRANSMISSION
          </p>
          <pre className="end-screen__share" data-testid="share-string">
            {shareString}
          </pre>
          <button
            type="button"
            className="end-screen__copy"
            data-testid="copy-button"
            onClick={handleCopy}
          >
            {copyState === "copied"
              ? "COPIED"
              : copyState === "error"
                ? "COPY BLOCKED — SELECT ABOVE"
                : "COPY"}
          </button>

          {/* Stats strip — streak + freezes. Heatmap / map arrive later;
              auto-fill grid keeps room for them. */}
          <div className="end-screen__stats" data-testid="end-screen-stats">
            <div className="end-screen__stat" data-testid="end-screen-streak">
              <span className="end-screen__stat-label">STREAK</span>
              <span className="end-screen__stat-value">{currentStreak}</span>
            </div>
            <div className="end-screen__stat" data-testid="end-screen-freezes">
              <span className="end-screen__stat-label">FREEZES</span>
              <span className="end-screen__stat-value">
                <span className="end-screen__freeze-icon" aria-hidden="true">
                  ❄
                </span>
                {freezes}
              </span>
            </div>
          </div>

          {/* Honest record (US-017): the recent window shows failures and
              missed days at the same weight as solves. Full 12-month history
              opens as an overlay — the app has no router, and an overlay
              keeps the explorable map underneath. */}
          <div className="end-screen__heatmap" data-testid="end-screen-heatmap">
            <p className="end-screen__kicker" aria-hidden="true">
              // RECORD — LAST {COMPACT_WEEKS} WEEKS
            </p>
            <Heatmap grid={compactGrid} showLegend label="Recent result heatmap" />
            <button
              type="button"
              className="end-screen__history"
              data-testid="full-history-button"
              onClick={() => setShowStats(true)}
            >
              FULL HISTORY
            </button>
          </div>

          {/* Trophy map (US-018): the long game. Today's solve fills its
              country as this screen opens; the collection it joins is the
              reason to come back after the streak inevitably breaks. */}
          <div className="end-screen__trophy" data-testid="end-screen-trophy">
            <p className="end-screen__kicker" aria-hidden="true">
              // TERRITORY
            </p>
            <TrophyMap
              countries={ALL_COUNTRIES}
              trophyMap={trophyMap}
              highlightCode={isSolve ? targetCode : null}
              showLegend={false}
              label="Solved countries world map"
            />
          </div>

          {noticeMessage ? (
            <p className="end-screen__notice" data-testid="streak-notice">
              {noticeMessage}
            </p>
          ) : null}

          {freezeRuleCopy ? (
            <p className="end-screen__freeze-rule" data-testid="freeze-rule">
              {freezeRuleCopy}
            </p>
          ) : null}

          <p className="end-screen__countdown" data-testid="next-round-countdown">
            <span className="end-screen__stat-label">NEXT DROP</span>
            <span className="end-screen__countdown-value">{countdown}</span>
          </p>
        </div>
      </motion.div>
      <AnimatePresence>
        {showStats && (
          <StatsOverlay
            key="stats-overlay"
            ledger={ledger}
            trophyMap={trophyMap}
            today={today}
            saveCode={saveCode}
            onImportCode={onImportCode}
            onClose={() => setShowStats(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
