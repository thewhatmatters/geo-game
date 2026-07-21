import { toUtcDateString } from "../streak";
import { isSolveStatus } from "../game/round";
import type { LetterState, RoundStatus } from "../game/round";

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
 * Guess-pattern encoding — spoiler-safe by construction: one square per
 * guess, in the order the player guessed, carrying only outcome, never a
 * letter or a position in the name.
 *
 *   🟩  correct letter
 *   ⬛  wrong letter, guessed while the clock was still running
 *   🟥  wrong letter, guessed in LOCKOUT (past 0:00) — one burnt attempt
 *
 * The 🟥 tier is this story's answer to the open "how does lockout show up
 * in the pattern row" question: lockout mistakes are the only ones that
 * cost a life, so they read differently from ordinary misses and a reader
 * can see how close the round came to locking out — still without learning
 * anything about the country.
 *
 * Object key order for single-character (non-numeric) string keys reflects
 * insertion order per the JS spec, so this reads the guesses in the order
 * they happened without needing separate history tracking. Lockout wrongs
 * are, by definition, the LAST `lockoutWrongCount` wrong guesses of the
 * round — no extra per-guess state needed.
 */
export function guessPatternRow(
  guesses: Record<string, LetterState>,
  lockoutWrongCount = 0,
): string {
  const letters = Object.keys(guesses);
  let wrongsBeforeLockout =
    letters.filter((l) => guesses[l] === "wrong").length - lockoutWrongCount;
  return letters
    .map((letter) => {
      if (guesses[letter] === "correct") return "🟩";
      wrongsBeforeLockout -= 1;
      return wrongsBeforeLockout >= 0 ? "⬛" : "🟥";
    })
    .join("");
}

export interface ShareInput {
  dayNumber: number;
  /** Terminal round status — all four outcomes are shareable. */
  status: RoundStatus;
  remainingSeconds: number;
  guesses: Record<string, LetterState>;
  targetName: string;
  /** Flag emoji for the target — included only on a solve, alongside the name. */
  targetFlag?: string;
  /** Wrong guesses spent from the lockout attempt budget (see guessPatternRow). */
  lockoutWrongCount?: number;
}

/** Result clause per outcome — mirrors the end screen's intrusion-log tone. */
function resultLine(status: RoundStatus, remainingSeconds: number): string {
  switch (status) {
    case "solved":
      return `ACCESS GRANTED — ${Math.ceil(remainingSeconds)}s left`;
    case "solved_late":
      return "ACCESS GRANTED — after the clock";
    case "locked_out":
      return "LOCKED OUT";
    case "gave_up":
      return "ABORTED";
    default:
      return "IN PROGRESS";
  }
}

/**
 * Chosen working format (the PRD leaves the exact visual format open):
 *
 *   GEO #12 — ACCESS GRANTED — 37s left
 *   🟩⬛🟩🟩
 *   🇨🇭 Switzerland
 *
 * The country line appears ONLY for solved / solved_late. A failed round
 * (locked_out, gave_up) omits it entirely, so a share never spoils the
 * answer for someone who hasn't played yet — and the pattern row carries no
 * letters or positions in any outcome.
 */
export function generateShareString(input: ShareInput): string {
  const {
    dayNumber,
    status,
    remainingSeconds,
    guesses,
    targetName,
    targetFlag = "",
    lockoutWrongCount = 0,
  } = input;

  const lines = [`GEO #${dayNumber} — ${resultLine(status, remainingSeconds)}`];
  // An instant give-up has no guesses at all — skip the row rather than
  // sharing a stray blank line.
  const pattern = guessPatternRow(guesses, lockoutWrongCount);
  if (pattern) lines.push(pattern);
  if (isSolveStatus(status)) {
    lines.push(targetFlag ? `${targetFlag} ${targetName}` : targetName);
  }
  return lines.join("\n");
}
