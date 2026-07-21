import type { RoundStatus } from "../game/round";

export const SAVE_STORAGE_KEY = "geo:save";
export const LEGACY_STREAK_STORAGE_KEY = "geo:streak";
export const SAVE_SCHEMA_VERSION = 1;

/** Per-day outcomes. `frozen` is written when a streak freeze covers a missed day. */
export type LedgerOutcome = "solved" | "solved_late" | "failed" | "frozen";

export interface LedgerEntry {
  outcome: LedgerOutcome;
  score: number;
  target: string;
}

export interface TrophyMapEntry {
  tier: "in_time" | "late";
  date: string;
}

export interface LegacyStreakBaseline {
  current_streak: number;
  longest_streak: number;
  last_played_date: string | null;
}

export interface GeoSave {
  version: typeof SAVE_SCHEMA_VERSION;
  ledger: Record<string, LedgerEntry>;
  trophyMap: Record<string, TrophyMapEntry>;
  /** Preserves pre-ledger streak values while all new streak changes derive from ledger entries. */
  streakMigration?: LegacyStreakBaseline;
}

const EMPTY_SAVE: GeoSave = {
  version: SAVE_SCHEMA_VERSION,
  ledger: {},
  trophyMap: {},
};

function validLegacyStreak(value: unknown): LegacyStreakBaseline | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<LegacyStreakBaseline>;
  if (
    typeof candidate.current_streak !== "number"
    || typeof candidate.longest_streak !== "number"
    || (candidate.last_played_date !== null && typeof candidate.last_played_date !== "string")
  ) return undefined;
  return {
    current_streak: Math.max(0, candidate.current_streak),
    longest_streak: Math.max(0, candidate.longest_streak),
    last_played_date: candidate.last_played_date,
  };
}

/** Reads the versioned save, importing the old streak snapshot exactly once. */
export function readSave(storage: Pick<Storage, "getItem" | "setItem"> = localStorage): GeoSave {
  const raw = storage.getItem(SAVE_STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<GeoSave>;
      if (parsed.version === SAVE_SCHEMA_VERSION) {
        return {
          version: SAVE_SCHEMA_VERSION,
          ledger: parsed.ledger ?? {},
          trophyMap: parsed.trophyMap ?? {},
          ...(parsed.streakMigration ? { streakMigration: parsed.streakMigration } : {}),
        };
      }
    } catch {
      // A corrupt save is replaced below; a valid legacy streak can still be recovered.
    }
  }

  let streakMigration: LegacyStreakBaseline | undefined;
  const legacyRaw = storage.getItem(LEGACY_STREAK_STORAGE_KEY);
  if (legacyRaw) {
    try {
      streakMigration = validLegacyStreak(JSON.parse(legacyRaw));
    } catch {
      // Ignore malformed legacy state.
    }
  }
  const save = { ...EMPTY_SAVE, ...(streakMigration ? { streakMigration } : {}) };
  storage.setItem(SAVE_STORAGE_KEY, JSON.stringify(save));
  return save;
}

export function writeSave(
  save: GeoSave,
  storage: Pick<Storage, "getItem" | "setItem"> = localStorage,
): GeoSave {
  storage.setItem(SAVE_STORAGE_KEY, JSON.stringify(save));
  return save;
}

export function recordOutcome(
  date: string,
  status: Exclude<RoundStatus, "running">,
  score: number,
  target: string,
  storage: Pick<Storage, "getItem" | "setItem"> = localStorage,
): GeoSave {
  const save = readSave(storage);
  const outcome: LedgerOutcome = status === "locked_out" || status === "gave_up" ? "failed" : status;
  const next: GeoSave = {
    ...save,
    ledger: { ...save.ledger, [date]: { outcome, score, target } },
    trophyMap: { ...save.trophyMap },
  };

  if (status === "solved" || status === "solved_late") {
    next.trophyMap[target] = {
      tier: status === "solved" ? "in_time" : "late",
      date,
    };
  }
  return writeSave(next, storage);
}

/** Writes freeze-covered miss days into the ledger (score/target empty by design). */
export function recordFrozenDays(
  dates: string[],
  storage: Pick<Storage, "getItem" | "setItem"> = localStorage,
): GeoSave {
  if (dates.length === 0) return readSave(storage);
  const save = readSave(storage);
  const ledger = { ...save.ledger };
  for (const date of dates) {
    if (ledger[date]) continue;
    ledger[date] = { outcome: "frozen", score: 0, target: "" };
  }
  return writeSave({ ...save, ledger }, storage);
}
