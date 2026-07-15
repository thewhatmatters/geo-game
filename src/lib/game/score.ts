import type { RoundStatus } from "./round";

/**
 * A rescaled presentation of remainingSeconds, not a second bookkeeping
 * system — remainingSeconds already reflects every modifier (wrong-guess
 * penalties, zoom-out penalties, the correct-streak bonus) since they all
 * just add/subtract from the same clock, so score is derived from it rather
 * than tracked independently. A flat completion bonus is added on top so a
 * last-second solve still feels rewarded, not near-zero.
 */
export const SCORE_BASE_POINTS = 500;
/** Points awarded per second of remaining time. */
export const SCORE_SECONDS_MULTIPLIER = 10;

/**
 * Live while running (ticks down with the clock, jumps on bonuses/
 * penalties) and freezes naturally on solve (the clock itself stops, so
 * remainingSeconds stops changing — no special-casing needed). Only a
 * failed/given-up round is force-zeroed: no reward for not solving, same
 * spirit as the share string keeping the country hidden on failure.
 */
export function computeScore(status: RoundStatus, remainingSeconds: number): number {
  if (status === "failed") return 0;
  return SCORE_BASE_POINTS + Math.round(remainingSeconds * SCORE_SECONDS_MULTIPLIER);
}
