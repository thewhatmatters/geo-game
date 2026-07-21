import { useCallback, useState } from "react";
import { readStreak, recordRoundOutcome } from "./index";
import type { StreakState } from "./index";
import type { RoundStatus } from "../game/round";

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
    (status: Exclude<RoundStatus, "running">, score: number, target: string) => {
      setStreak(recordRoundOutcome(status, date, score, target));
    },
    [date],
  );

  return { streak, recordOutcome };
}
