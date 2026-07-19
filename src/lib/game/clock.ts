/** The clock is only a round pacer: player actions never alter it. */
export const ROUND_DURATION_SECONDS = 60;

/** Advances the pacer toward zero without giving zero terminal semantics. */
export function tickClock(remainingSeconds: number, deltaSeconds: number): number {
  return Math.max(0, remainingSeconds - Math.max(0, deltaSeconds));
}
