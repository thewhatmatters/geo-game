import { useEffect, useMemo, useState } from "react";
import type { RoundStatus, ScoreEvent } from "../../lib/game/round";
import {
  buildScoreBreakdown,
  outcomeHeadline,
  type BreakdownLine,
} from "../../lib/game/scoreBreakdown";

/**
 * End screen Act 1 — Street-Fighter-style itemized score recap.
 *
 * Mounted on any terminal outcome. Reads RoundCore's score-event log via
 * buildScoreBreakdown (no re-derivation). Lines cascade in sequence with a
 * terminal cadence (CSS entrance + staggered mount); reduced-motion users
 * get the full list at once.
 *
 * Act 2 (share / countdown / retention) lands in US-013 and will extend
 * this shell — keep the surface self-contained so that story only adds
 * siblings, not a rewrite.
 */

/** Delay between successive line reveals (ms). */
export const LINE_STAGGER_MS = 280;

export interface EndScreenProps {
  status: RoundStatus;
  /** Event-sourced running total (floored), before time bonus / failure zero. */
  eventScore: number;
  scoreEvents: ScoreEvent[];
  remainingSeconds: number;
  dayNumber: number;
}

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

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function EndScreen({
  status,
  eventScore,
  scoreEvents,
  remainingSeconds,
  dayNumber,
}: EndScreenProps) {
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

  return (
    <div
      className="end-screen"
      data-testid="end-screen"
      data-outcome={status}
      role="dialog"
      aria-label={headline}
    >
      <div className="end-screen__panel">
        <p
          className={`end-screen__headline${isSolve ? " end-screen__headline--granted" : " end-screen__headline--denied"}`}
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
      </div>
    </div>
  );
}
