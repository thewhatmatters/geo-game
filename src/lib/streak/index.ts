import { readSave, recordOutcome as writeOutcome } from "../storage/outcomes";
import type { GeoSave, LedgerEntry } from "../storage/outcomes";
import type { RoundStatus } from "../game/round";

export interface StreakState {
  current_streak: number;
  longest_streak: number;
  last_played_date: string | null;
}

const DEFAULT_STATE: StreakState = {
  current_streak: 0,
  longest_streak: 0,
  last_played_date: null,
};

function wasYesterday(lastPlayedDate: string, today: string): boolean {
  const last = new Date(`${lastPlayedDate}T00:00:00Z`).getTime();
  const current = new Date(`${today}T00:00:00Z`).getTime();
  const diffDays = Math.round((current - last) / (1000 * 60 * 60 * 24));
  return diffDays === 1;
}

function applyEntry(state: StreakState, date: string, entry: LedgerEntry): StreakState {
  if (state.last_played_date && date <= state.last_played_date) return state;
  if (entry.outcome === "failed") return { ...state, current_streak: 0, last_played_date: date };
  const current = state.last_played_date && wasYesterday(state.last_played_date, date)
    ? state.current_streak + 1
    : 1;
  return {
    current_streak: current,
    longest_streak: Math.max(state.longest_streak, current),
    last_played_date: date,
  };
}

export function deriveStreak(save: GeoSave): StreakState {
  const initial = save.streakMigration ?? DEFAULT_STATE;
  return Object.entries(save.ledger)
    .sort(([a], [b]) => a.localeCompare(b))
    .reduce((state, [date, entry]) => applyEntry(state, date, entry), { ...initial });
}

export function readStreak(storage: Pick<Storage, "getItem" | "setItem"> = localStorage): StreakState {
  return deriveStreak(readSave(storage));
}

/**
 * Records a round's outcome against the persisted streak, per CLAUDE.md's
 * "streak counter (consecutive days solved)" rule. Same-local-day re-calls
 * replace the ledger entry, so effects can safely run more than once without
 * incrementing the streak twice.
 */
export function recordRoundOutcome(
  status: Exclude<RoundStatus, "running">,
  today: string,
  score: number,
  target: string,
  storage: Pick<Storage, "getItem" | "setItem"> = localStorage,
): StreakState {
  return deriveStreak(writeOutcome(today, status, score, target, storage));
}
