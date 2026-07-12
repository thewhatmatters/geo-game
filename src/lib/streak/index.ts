const STORAGE_KEY = "geo:streak";

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

export function toUtcDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function wasYesterday(lastPlayedDate: string, today: string): boolean {
  const last = new Date(`${lastPlayedDate}T00:00:00Z`).getTime();
  const current = new Date(`${today}T00:00:00Z`).getTime();
  const diffDays = Math.round((current - last) / (1000 * 60 * 60 * 24));
  return diffDays === 1;
}

export function readStreak(): StreakState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_STATE;
  try {
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_STATE;
  }
}

function writeStreak(state: StreakState): StreakState {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  return state;
}

/**
 * Records a round's outcome against the persisted streak, per CLAUDE.md's
 * "streak counter (consecutive days solved)" rule. Same-UTC-day re-calls
 * (e.g. an effect firing twice) are idempotent — they neither increment nor
 * reset a streak already recorded for today.
 */
export function recordRoundOutcome(outcome: "solved" | "failed", date: Date = new Date()): StreakState {
  const today = toUtcDateString(date);
  const prev = readStreak();

  if (prev.last_played_date === today) return prev;

  if (outcome === "failed") {
    return writeStreak({ ...prev, current_streak: 0, last_played_date: today });
  }

  const nextCurrent = prev.last_played_date && wasYesterday(prev.last_played_date, today)
    ? prev.current_streak + 1
    : 1;

  return writeStreak({
    current_streak: nextCurrent,
    longest_streak: Math.max(prev.longest_streak, nextCurrent),
    last_played_date: today,
  });
}
