import { useCallback, useMemo, useState } from "react";
import {
  applyPendingFreezes,
  freezeCoveredMessage,
  freezeEarnedMessage,
  recordRoundOutcome,
  streakBrokenMessage,
  type StreakNotices,
  type StreakState,
} from "./index";
import type { RoundStatus } from "../game/round";

export interface UseStreakResult {
  streak: StreakState;
  notices: StreakNotices;
  /** Kind, ready-to-render message for the current notices (or null). */
  noticeMessage: string | null;
  recordOutcome: (
    status: Exclude<RoundStatus, "running">,
    score: number,
    target: string,
  ) => void;
}

/**
 * Exposes the persisted streak, read synchronously on first render (with
 * freezes auto-applied for any bridgeable missed days), plus a way to record
 * a round's outcome.
 *
 * @param date The boot date (see lib/game/boot.ts) — outcomes are recorded
 * against the puzzle's day, not the wall clock at solve time, so a round
 * that straddles midnight still credits the day whose puzzle was solved.
 */
export function useStreak(date: string): UseStreakResult {
  const [boot] = useState(() => applyPendingFreezes(date));
  const [streak, setStreak] = useState<StreakState>(boot.state);
  const [notices, setNotices] = useState<StreakNotices>(boot.notices);

  const recordOutcome = useCallback(
    (status: Exclude<RoundStatus, "running">, score: number, target: string) => {
      const result = recordRoundOutcome(status, date, score, target);
      setStreak(result.state);
      setNotices(result.notices);
    },
    [date],
  );

  const noticeMessage = useMemo(() => {
    // Break framing wins when freezes couldn't fully cover the gap.
    if (notices.brokenStreak && notices.brokenStreak > 0) {
      return streakBrokenMessage(notices.brokenStreak, streak.longest_streak);
    }
    if (notices.frozenDates.length > 0) {
      return freezeCoveredMessage(notices.frozenDates);
    }
    if (notices.earnedFreeze) {
      return freezeEarnedMessage();
    }
    return null;
  }, [notices, streak.longest_streak]);

  return { streak, notices, noticeMessage, recordOutcome };
}
