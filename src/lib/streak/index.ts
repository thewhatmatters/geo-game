import {
  readSave,
  recordFrozenDays,
  recordOutcome as writeOutcome,
} from "../storage/outcomes";
import type { GeoSave, LedgerEntry } from "../storage/outcomes";
import type { RoundStatus } from "../game/round";

/** Earn one freeze every N consecutive solved days (solved_late counts). */
export const FREEZE_EARN_EVERY = 5;
/** Maximum freezes a player can bank at once. */
export const FREEZE_BANK_CAP = 2;

/** One-line rule shown wherever freezes appear (Duolingo-style explainer). */
export const FREEZE_RULE_COPY =
  "Earn 1 freeze every 5 days in a row (max 2). Miss a day? A freeze covers it.";

export interface StreakState {
  current_streak: number;
  longest_streak: number;
  last_played_date: string | null;
  /** Banked freeze tokens remaining. */
  freezes: number;
}

/** Session notices produced when freezes apply or a streak breaks/earns. */
export interface StreakNotices {
  /** Dates just covered by auto-applied freezes. */
  frozenDates: string[];
  /** True when the most recent solve crossed an earn threshold. */
  earnedFreeze: boolean;
  /**
   * Length of a streak that just ended (gap too large or a failed round).
   * Null when nothing broke this pass.
   */
  brokenStreak: number | null;
}

export interface StreakResult {
  state: StreakState;
  notices: StreakNotices;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function parseUtcDay(date: string): number {
  return new Date(`${date}T00:00:00Z`).getTime();
}

/** Whole calendar days from `from` to `to` (to − from). */
export function dayDiff(from: string, to: string): number {
  return Math.round((parseUtcDay(to) - parseUtcDay(from)) / MS_PER_DAY);
}

function wasYesterday(lastPlayedDate: string, today: string): boolean {
  return dayDiff(lastPlayedDate, today) === 1;
}

/** Inclusive range of YYYY-MM-DD strings strictly between two dates. */
export function datesBetween(from: string, to: string): string[] {
  const gap = dayDiff(from, to) - 1;
  if (gap <= 0) return [];
  const out: string[] = [];
  let cursor = parseUtcDay(from) + MS_PER_DAY;
  for (let i = 0; i < gap; i++) {
    out.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += MS_PER_DAY;
  }
  return out;
}

function applyEntry(state: StreakState, date: string, entry: LedgerEntry): StreakState {
  if (state.last_played_date && date <= state.last_played_date) return state;

  // Uncovered gap between ledger entries: freezes should already have written
  // `frozen` rows for bridgeable days. Anything still missing is a real break.
  if (state.last_played_date && dayDiff(state.last_played_date, date) > 1) {
    if (entry.outcome === "failed") {
      return { ...state, current_streak: 0, last_played_date: date };
    }
    if (entry.outcome === "frozen") {
      // Shouldn't appear after an uncovered gap in a consistent ledger; treat
      // as a bridge from zero if it does.
      return {
        ...state,
        freezes: Math.max(0, state.freezes - 1),
        last_played_date: date,
      };
    }
    // Solve after a real miss — streak restarts at 1.
    const current = 1;
    const freezes =
      current % FREEZE_EARN_EVERY === 0
        ? Math.min(FREEZE_BANK_CAP, state.freezes + 1)
        : state.freezes;
    return {
      current_streak: current,
      longest_streak: Math.max(state.longest_streak, current),
      last_played_date: date,
      freezes,
    };
  }

  if (entry.outcome === "failed") {
    return { ...state, current_streak: 0, last_played_date: date };
  }

  if (entry.outcome === "frozen") {
    return {
      ...state,
      freezes: Math.max(0, state.freezes - 1),
      last_played_date: date,
    };
  }

  // solved | solved_late
  const current =
    state.last_played_date && wasYesterday(state.last_played_date, date)
      ? state.current_streak + 1
      : 1;
  const freezes =
    current % FREEZE_EARN_EVERY === 0
      ? Math.min(FREEZE_BANK_CAP, state.freezes + 1)
      : state.freezes;
  return {
    current_streak: current,
    longest_streak: Math.max(state.longest_streak, current),
    last_played_date: date,
    freezes,
  };
}

/**
 * Pure derivation of streak + banked freezes from the ledger.
 * When `asOf` is set, any still-uncovered gap before that date zeroes the
 * current streak (visit after freezes couldn't cover the miss).
 */
export function deriveStreak(save: GeoSave, asOf?: string): StreakState {
  const initial: StreakState = {
    ...(save.streakMigration
      ? {
          current_streak: save.streakMigration.current_streak,
          longest_streak: save.streakMigration.longest_streak,
          last_played_date: save.streakMigration.last_played_date,
        }
      : {
          current_streak: 0,
          longest_streak: 0,
          last_played_date: null,
        }),
    freezes: 0,
  };

  let state = Object.entries(save.ledger)
    .sort(([a], [b]) => a.localeCompare(b))
    .reduce((s, [date, entry]) => applyEntry(s, date, entry), initial);

  if (asOf && state.last_played_date && dayDiff(state.last_played_date, asOf) > 1) {
    // Missed day(s) past the last ledger entry with no freezes left to apply.
    state = { ...state, current_streak: 0 };
  }

  return state;
}

/** Most recent ledger date whose outcome is not `frozen` (solve or fail). */
function lastNonFrozenDate(save: GeoSave): string | null {
  const dates = Object.entries(save.ledger)
    .filter(([, e]) => e.outcome !== "frozen")
    .map(([d]) => d)
    .sort((a, b) => a.localeCompare(b));
  return dates[dates.length - 1] ?? null;
}

/**
 * Frozen bridge days between the last real play and `today`. Used for visit
 * messaging so React StrictMode's double-init (second apply is a no-op) still
 * surfaces "A streak freeze covered …".
 */
function bridgingFrozenDates(save: GeoSave, today: string): string[] {
  const anchor = lastNonFrozenDate(save);
  if (!anchor) return [];
  return datesBetween(anchor, today).filter((d) => save.ledger[d]?.outcome === "frozen");
}

/**
 * Auto-apply banked freezes to uncovered days between the last ledger activity
 * and `today` (exclusive of today — today is still playable). Writes `frozen`
 * ledger rows chronologically. Deterministic and idempotent.
 */
export function applyPendingFreezes(
  today: string,
  storage: Pick<Storage, "getItem" | "setItem"> = localStorage,
): StreakResult {
  const save = readSave(storage);
  let state = deriveStreak(save);
  const newlyFrozen: string[] = [];

  if (state.last_played_date && state.freezes > 0) {
    const candidates = datesBetween(state.last_played_date, today).filter(
      (d) => !save.ledger[d],
    );
    for (const date of candidates) {
      if (state.freezes <= 0) break;
      newlyFrozen.push(date);
      state = {
        ...state,
        freezes: state.freezes - 1,
        last_played_date: date,
      };
    }
  }

  if (newlyFrozen.length > 0) {
    recordFrozenDays(newlyFrozen, storage);
  }

  // Re-derive after writes (and zero current if a residual gap remains).
  const finalSave = readSave(storage);
  const beforeBreak = deriveStreak(finalSave);
  const finalState = deriveStreak(finalSave, today);
  const brokenStreak =
    beforeBreak.current_streak > 0 && finalState.current_streak === 0
      ? beforeBreak.current_streak
      : null;

  // Prefer the full bridge (idempotent) so a second StrictMode init still
  // reports the freeze that was just (or previously) applied for this visit.
  const frozenDates = bridgingFrozenDates(finalSave, today);

  return {
    state: finalState,
    notices: {
      frozenDates,
      earnedFreeze: false,
      brokenStreak,
    },
  };
}

export function readStreak(
  storage: Pick<Storage, "getItem" | "setItem"> = localStorage,
  asOf?: string,
): StreakState {
  return deriveStreak(readSave(storage), asOf);
}

/**
 * Records a round's outcome against the persisted streak. Same-local-day
 * re-calls replace the ledger entry. Applies any pending freezes first so a
 * solve after a bridgeable miss lands on a continuous streak.
 */
export function recordRoundOutcome(
  status: Exclude<RoundStatus, "running">,
  today: string,
  score: number,
  target: string,
  storage: Pick<Storage, "getItem" | "setItem"> = localStorage,
): StreakResult {
  const prior = applyPendingFreezes(today, storage);
  const freezesBefore = prior.state.freezes;
  const streakBefore = prior.state.current_streak;

  writeOutcome(today, status, score, target, storage);
  const state = deriveStreak(readSave(storage), today);

  const isSolve = status === "solved" || status === "solved_late";
  const earnedFreeze = isSolve && state.freezes > freezesBefore;

  let brokenStreak: number | null = prior.notices.brokenStreak;
  if (!isSolve && streakBefore > 0 && state.current_streak === 0) {
    brokenStreak = streakBefore;
  }

  return {
    state,
    notices: {
      frozenDates: prior.notices.frozenDates,
      earnedFreeze,
      brokenStreak,
    },
  };
}

/** Kind copy when freezes cover missed day(s). */
export function freezeCoveredMessage(dates: string[]): string {
  if (dates.length === 0) return "";
  if (dates.length === 1) return `A streak freeze covered ${dates[0]}`;
  return `Streak freezes covered ${dates[0]}–${dates[dates.length - 1]}`;
}

/** Celebrate the ended run — never shame framing. */
export function streakBrokenMessage(ended: number, longest: number): string {
  if (ended <= 0) return "";
  if (ended >= longest) {
    return `Your ${ended}-day streak ends — your longest yet.`;
  }
  return `Your ${ended}-day streak ends. Best remains ${longest}.`;
}

export function freezeEarnedMessage(): string {
  return "Freeze earned — banked for a rainy day.";
}
