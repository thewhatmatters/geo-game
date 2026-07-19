import type { RoundStatus } from "./round";

/**
 * A rescaled presentation of remainingSeconds, not a second bookkeeping
 * system — the clock is a pure pacer now (nothing adds or steals time), so
 * score simply decays with it. A flat completion bonus is added on top so a
 * last-second solve still feels rewarded, not near-zero. (Interim scoring:
 * the event-sourced score economy with combo multiplier replaces this.)
 */
export const SCORE_BASE_POINTS = 500;
/** Points awarded per second of remaining time. */
export const SCORE_SECONDS_MULTIPLIER = 10;

/**
 * Live while running (ticks down with the clock) and freezes naturally on
 * solve (the clock itself stops, so remainingSeconds stops changing — no
 * special-casing needed). Only a failed/given-up round is force-zeroed: no
 * reward for not solving, same spirit as the share string keeping the
 * country hidden on failure.
 */
export function computeScore(status: RoundStatus, remainingSeconds: number): number {
  if (status === "failed") return 0;
  return SCORE_BASE_POINTS + Math.round(remainingSeconds * SCORE_SECONDS_MULTIPLIER);
}
