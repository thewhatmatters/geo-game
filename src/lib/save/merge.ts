import type { GeoSave, LedgerEntry, LedgerOutcome, TrophyMapEntry } from "../storage/outcomes";
import { SAVE_SCHEMA_VERSION } from "../storage/outcomes";

/**
 * Import merge (US-019). An import is additive, never a replacement: a code
 * restored onto a device that has since played more days must not throw that
 * history away, and a device restoring an older code must not lose the days
 * the code doesn't know about. So both ledgers are unioned, and only the days
 * both sides claim need a rule — the better outcome wins.
 */

/** Higher wins a same-day conflict. A real play always beats a freeze bridge. */
const OUTCOME_RANK: Record<LedgerOutcome, number> = {
  solved: 4,
  solved_late: 3,
  failed: 2,
  frozen: 1,
};

/** The better of two records for the same day — ties broken by score. */
export function betterEntry(a: LedgerEntry, b: LedgerEntry): LedgerEntry {
  const delta = OUTCOME_RANK[a.outcome] - OUTCOME_RANK[b.outcome];
  if (delta !== 0) return delta > 0 ? a : b;
  return b.score > a.score ? b : a;
}

/** In-time beats late; same tier keeps the earlier claim. */
function betterTrophy(a: TrophyMapEntry, b: TrophyMapEntry): TrophyMapEntry {
  if (a.tier !== b.tier) return a.tier === "in_time" ? a : b;
  return b.date < a.date ? b : a;
}

export function mergeSaves(local: GeoSave, incoming: GeoSave): GeoSave {
  const ledger: Record<string, LedgerEntry> = { ...local.ledger };
  for (const [date, entry] of Object.entries(incoming.ledger)) {
    const existing = ledger[date];
    ledger[date] = existing ? betterEntry(existing, entry) : entry;
  }

  const trophyMap: Record<string, TrophyMapEntry> = { ...local.trophyMap };
  for (const [code, entry] of Object.entries(incoming.trophyMap)) {
    const existing = trophyMap[code];
    trophyMap[code] = existing ? betterTrophy(existing, entry) : entry;
  }

  const merged: GeoSave = { version: SAVE_SCHEMA_VERSION, ledger, trophyMap };

  // The pre-ledger baseline is a floor, not a record of days — keep the
  // highest each side ever reached and the later anchor date.
  const baselines = [local.streakMigration, incoming.streakMigration].filter(
    (value): value is NonNullable<GeoSave["streakMigration"]> => Boolean(value),
  );
  if (baselines.length > 0) {
    merged.streakMigration = {
      current_streak: Math.max(...baselines.map((b) => b.current_streak)),
      longest_streak: Math.max(...baselines.map((b) => b.longest_streak)),
      last_played_date: baselines
        .map((b) => b.last_played_date)
        .filter((d): d is string => Boolean(d))
        .sort()
        .pop() ?? null,
    };
  }

  return merged;
}
