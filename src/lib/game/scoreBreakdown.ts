import type { RoundStatus, ScoreEvent } from "./round";
import { computeScore, timeBonus } from "./score";

/**
 * End-screen Act 1 — pure reconstruction of the round's score story from
 * RoundCore's score-event log. No re-derivation of the economy rules: every
 * letter/mistake/recon figure is a sum of events already emitted, the time
 * bonus is the same selector computeScore uses, and TOTAL is always
 * computeScore(status, score, remainingSeconds).
 *
 * Line items are guaranteed to sum to the final score. When the score floor
 * clipped a penalty (events sum below the floored running total) or a
 * failure wiped the earned total to 0, a residual line absorbs the
 * difference so the Street-Fighter recap stays arithmetically honest.
 */

/** Minimal slice of RoundState the breakdown needs — keeps the UI from
 *  threading the whole reducer state through a presentational surface. */
export interface ScoreBreakdownInput {
  status: RoundStatus;
  /** Event-sourced running total (floored), BEFORE time bonus / failure zero. */
  score: number;
  scoreEvents: ScoreEvent[];
  remainingSeconds: number;
}

export type BreakdownLineKey =
  | "letters"
  | "mistakes"
  | "recon"
  | "time"
  | "residual"
  | "total";

export interface BreakdownLine {
  key: BreakdownLineKey;
  /** Intrusion-log label — uppercase monospaced terminal tone. */
  label: string;
  amount: number;
  /**
   * Optional secondary context (e.g. peak combo "×2") rendered next to the
   * letters line. Empty for everything else.
   */
  context?: string;
}

export interface ScoreBreakdown {
  /** Ordered display lines including TOTAL. Residual omitted when 0. */
  lines: BreakdownLine[];
  /** Final display score — what the live readout freezes at. */
  total: number;
  status: RoundStatus;
  /** Peak combo multiplier seen on any correct-letter event (1 if none). */
  peakMultiplier: number;
}

/** Outcome banner for the end-screen header — pairs with day number. */
export function outcomeHeadline(status: RoundStatus, dayNumber: number): string {
  const tag =
    status === "solved"
      ? "ACCESS GRANTED"
      : status === "solved_late"
        ? "LATE ENTRY"
        : status === "locked_out"
          ? "LOCKOUT"
          : status === "gave_up"
            ? "ABORTED"
            : "IN PROGRESS";
  return `GEO #${dayNumber} — ${tag}`;
}

function sumByType(events: ScoreEvent[], type: ScoreEvent["type"]): number {
  return events.reduce((sum, e) => (e.type === type ? sum + e.delta : sum), 0);
}

function peakMultiplier(events: ScoreEvent[]): number {
  let peak = 1;
  for (const e of events) {
    if (e.type === "correct" && e.multiplier > peak) peak = e.multiplier;
  }
  return peak;
}

function residualLabel(status: RoundStatus, residual: number): string {
  if (status === "locked_out" || status === "gave_up") return "ACCESS REVOKED";
  // Floor absorbed part of a penalty — the nominal event sum undershot.
  if (residual > 0) return "SIGNAL CLIP";
  return "SIGNAL DRIFT";
}

/**
 * Build the Act 1 breakdown from a terminal (or live) round slice.
 * Safe to call while running — total then equals the live event-sourced
 * score with no time bonus — but the end screen only mounts post-round.
 */
export function buildScoreBreakdown(input: ScoreBreakdownInput): ScoreBreakdown {
  const { status, score, scoreEvents, remainingSeconds } = input;
  let letters = sumByType(scoreEvents, "correct");
  let mistakes = sumByType(scoreEvents, "wrong");
  let recon = sumByType(scoreEvents, "zoom");
  const speed = timeBonus(status, remainingSeconds);
  const total = computeScore(status, score, remainingSeconds);
  const peak = peakMultiplier(scoreEvents);

  // Score floor: nominal wrong/zoom deltas can sum below the floored
  // running total. Fold the gap into the penalty lines (mistakes first,
  // then recon) so TRACE PENALTY shows what actually stuck, not the
  // uncapped charge the popup reported mid-round.
  let floorGap = score - (letters + mistakes + recon);
  if (floorGap > 0 && mistakes < 0) {
    const absorb = Math.min(floorGap, -mistakes);
    mistakes += absorb;
    floorGap -= absorb;
  }
  if (floorGap > 0 && recon < 0) {
    const absorb = Math.min(floorGap, -recon);
    recon += absorb;
    floorGap -= absorb;
  }

  // Residual closes the books:
  //  - failure zeroing (ACCESS REVOKED, typically −earned)
  //  - any unabsorbed floor gap (SIGNAL CLIP)
  //  - defensive catch-all for future computeScore rules
  const residual = total - (letters + mistakes + recon + speed);

  const lines: BreakdownLine[] = [
    {
      key: "letters",
      label: "DATA RECONSTITUTION",
      amount: letters,
      context: peak > 1 ? `×${peak} PEAK` : undefined,
    },
    {
      key: "mistakes",
      label: "TRACE PENALTY",
      amount: mistakes,
    },
    {
      key: "recon",
      label: "SURVEILLANCE COST",
      amount: recon,
    },
    {
      key: "time",
      label: "SPEED BONUS",
      // Always present: late/fail/running show an explicit 0 so the recap
      // shape is stable across all four terminal outcomes.
      amount: speed,
    },
  ];

  if (residual !== 0) {
    lines.push({
      key: "residual",
      label: residualLabel(status, residual),
      amount: residual,
    });
  }

  lines.push({
    key: "total",
    label: "TOTAL ACCESS",
    amount: total,
  });

  return { lines, total, status, peakMultiplier: peak };
}

/** Sum of every non-total line amount — equals total when the books balance. */
export function breakdownLineSum(breakdown: ScoreBreakdown): number {
  return breakdown.lines
    .filter((line) => line.key !== "total")
    .reduce((sum, line) => sum + line.amount, 0);
}
