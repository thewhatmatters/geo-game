import { toUtcDateString } from "../streak";
import type { LetterState } from "../game/useGameRound";

/**
 * Placeholder v1 launch date — day numbering starts at 1 on this UTC date.
 * No real launch date exists yet (PRD leaves this unspecified); update this
 * constant once the game actually ships.
 */
export const LAUNCH_DATE = "2026-07-11";

/** Day number is 1-indexed, counting UTC calendar days since LAUNCH_DATE. */
export function getDayNumber(date: Date): number {
  const launchMs = new Date(`${LAUNCH_DATE}T00:00:00Z`).getTime();
  const currentMs = new Date(`${toUtcDateString(date)}T00:00:00Z`).getTime();
  return Math.round((currentMs - launchMs) / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * Spoiler-safe guess-pattern row: one square per guess, in the order the
 * player guessed, colored by correct/wrong only — no letters shown. Object
 * key order for single-character (non-numeric) string keys reflects
 * insertion order per the JS spec, so this reads the guesses in the order
 * they happened without needing separate history tracking.
 */
export function guessPatternRow(guesses: Record<string, LetterState>): string {
  return Object.keys(guesses)
    .map((letter) => (guesses[letter] === "correct" ? "🟩" : "⬛"))
    .join("");
}

export interface ShareInput {
  dayNumber: number;
  status: "solved" | "failed";
  remainingSeconds: number;
  guesses: Record<string, LetterState>;
  targetName: string;
}

/**
 * Chosen working format (PRD leaves exact visual format open, per this
 * story's notes):
 *
 *   Geo #12 — Solved with 37s left
 *   🟩⬛🟩🟩
 *   Switzerland
 *
 * A failed round omits the country name line entirely, so the answer is
 * never spoiled for someone who hasn't solved it yet.
 */
export function generateShareString(input: ShareInput): string {
  const { dayNumber, status, remainingSeconds, guesses, targetName } = input;
  const outcomeLine =
    status === "solved" ? `Solved with ${Math.ceil(remainingSeconds)}s left` : "Failed";
  const lines = [`Geo #${dayNumber} — ${outcomeLine}`, guessPatternRow(guesses)];
  if (status === "solved") {
    lines.push(targetName);
  }
  return lines.join("\n");
}
