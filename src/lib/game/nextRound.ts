/**
 * "Next round drops in…" — the end screen's return hook.
 *
 * Deliberately LOCAL midnight, not UTC: the daily ritual should land on the
 * player's own day boundary. The daily-country hash still keys off the UTC
 * date until US-014 flips it to the local date; this countdown is already
 * pointed at where that's going, so the two agree once that story lands.
 *
 * Pure functions of an injected `now` — no wall-clock reads here, so the
 * behavior is testable without freezing timers.
 */

const MS_PER_SECOND = 1000;

/** Milliseconds from `now` until the next local calendar midnight (never negative, never 0 at exactly midnight — it rolls to the following day). */
export function msUntilNextLocalMidnight(now: Date): number {
  const nextMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    0,
    0,
  );
  return nextMidnight.getTime() - now.getTime();
}

/** HH:MM:SS, zero-padded, rounded up to the next whole second so the readout never shows 00:00:00 before the day has actually flipped. */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / MS_PER_SECOND));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, "0")).join(":");
}

/** Convenience for the UI: the formatted countdown to the next local-midnight round. */
export function countdownToNextRound(now: Date): string {
  return formatCountdown(msUntilNextLocalMidnight(now));
}
