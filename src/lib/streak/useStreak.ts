import { useCallback, useState } from "react";
import { readStreak, recordRoundOutcome } from "./index";
import type { StreakState } from "./index";

/** Exposes the persisted streak, read synchronously on first render, plus a way to record a round's outcome. */
export function useStreak() {
  const [streak, setStreak] = useState<StreakState>(() => readStreak());

  const recordOutcome = useCallback((outcome: "solved" | "failed") => {
    setStreak(recordRoundOutcome(outcome));
  }, []);

  return { streak, recordOutcome };
}
