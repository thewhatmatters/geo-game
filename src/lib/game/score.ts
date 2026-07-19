import type { RoundState, RoundStatus } from "./round";

/**
 * The score economy's single tunable surface. Every number the economy
 * uses lives here as an exported named constant — RoundCore imports these
 * and never hard-codes a value, so playtesting retunes the game by editing
 * this file alone.
 *
 * Score is event-sourced: it is the running sum of per-guess deltas
 * accumulated in RoundState.score (see reduceGuess in round.ts), NOT a
 * function of the clock. The clock is a pure pacer; it earns nothing.
 */

/** Base award for a correct letter, before the combo multiplier. */
export const CORRECT_LETTER_POINTS = 100;

/**
 * Combo ladder, indexed by consecutive-correct count (1-based): the first
 * correct letter pays x1, the second x1.5, the third and every one after
 * x2 — the last entry is the cap. Any wrong letter drops back to index 1.
 */
export const COMBO_MULTIPLIER_STEPS = [1, 1.5, 2] as const;

/**
 * Wrong-letter deduction, keyed off the target's UNIQUE letter count (not
 * raw name length — "Mississippi" is 11 letters but only 4 unique, and
 * should be penalised as the 4-letter puzzle it actually is). Short
 * alphabets mean fewer viable guesses, so a wrong one costs more.
 * First matching tier wins; the last is the open-ended catch-all.
 */
export const WRONG_LETTER_PENALTY_TIERS = [
  { maxUniqueLetters: 5, penalty: 200 },
  { maxUniqueLetters: 9, penalty: 150 },
  { maxUniqueLetters: Infinity, penalty: 100 },
] as const;

/** The running score never goes below this — a bad streak stalls you at 0, it doesn't bury you. */
export const SCORE_FLOOR = 0;

/** Multiplier for the Nth consecutive correct letter (N counted inclusive of that letter), capped at the ladder's last step. */
export function comboMultiplier(correctStreak: number): number {
  if (correctStreak < 1) return COMBO_MULTIPLIER_STEPS[0];
  const index = Math.min(correctStreak - 1, COMBO_MULTIPLIER_STEPS.length - 1);
  return COMBO_MULTIPLIER_STEPS[index];
}

/** Points a correct letter awards, given the consecutive-correct count it lands on (inclusive). */
export function correctLetterPoints(correctStreak: number): number {
  return Math.round(CORRECT_LETTER_POINTS * comboMultiplier(correctStreak));
}

/** Positive magnitude of the wrong-letter deduction for a target with this many unique letters. */
export function wrongLetterPenalty(uniqueLetterCount: number): number {
  const tier = WRONG_LETTER_PENALTY_TIERS.find((t) => uniqueLetterCount <= t.maxUniqueLetters);
  return (tier ?? WRONG_LETTER_PENALTY_TIERS[WRONG_LETTER_PENALTY_TIERS.length - 1]).penalty;
}

/** Applies a delta to a running score, holding the floor. */
export function applyScoreDelta(score: number, delta: number): number {
  return Math.max(SCORE_FLOOR, score + delta);
}

/**
 * What the UI displays. The stored score is already floored at 0; the only
 * extra rule is that a failed/given-up round shows nothing earned — same
 * spirit as the share string keeping the country hidden on failure.
 */
export function computeScore(status: RoundStatus, score: number): number {
  if (status === "failed") return 0;
  return score;
}

/** Convenience overload point for callers holding a whole RoundState. */
export function roundScore(state: RoundState): number {
  return computeScore(state.status, state.score);
}
