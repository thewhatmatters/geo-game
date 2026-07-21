import { useCallback, useState } from "react";
import { readStreak, recordRoundOutcome } from "./index";
import type { StreakState } from "./index";

/**
 * Exposes the persisted streak, read synchronously on first render, plus a
 * way to record a round's outcome.
 *
 * @param date The boot date (see lib/game/boot.ts) — outcomes are recorded
 * against the puzzle's day, not the wall clock at solve time, so a round
 * that straddles midnight still credits the day whose puzzle was solved.
 */
export function useStreak(date: string) {
  const [streak, setStreak] = useState<StreakState>(() => readStreak());

  const recordOutcome = useCallback(
    (outcome: "solved" | "failed") => {
      setStreak(recordRoundOutcome(outcome, date));
    },
    [date],
  );

  return { streak, recordOutcome };
}
