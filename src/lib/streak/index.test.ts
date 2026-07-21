import { describe, expect, it } from "vitest";
import {
  applyPendingFreezes,
  FREEZE_BANK_CAP,
  FREEZE_EARN_EVERY,
  freezeCoveredMessage,
  readStreak,
  recordRoundOutcome,
  streakBrokenMessage,
} from "./index";
import {
  LEGACY_STREAK_STORAGE_KEY,
  readSave,
  SAVE_STORAGE_KEY,
} from "../storage/outcomes";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
}

/** N consecutive solves starting at startDate (YYYY-MM-DD). */
function solveDays(storage: Storage, startDate: string, count: number): void {
  const start = new Date(`${startDate}T00:00:00Z`);
  for (let i = 0; i < count; i++) {
    const d = new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10);
    recordRoundOutcome("solved", d, 500, "PE", storage);
  }
}

describe("ledger-derived streak", () => {
  it("increments across consecutive solve days, including a late solve", () => {
    const storage = memoryStorage();
    recordRoundOutcome("solved", "2026-07-01", 500, "PE", storage);
    const { state } = recordRoundOutcome("solved_late", "2026-07-02", 200, "JP", storage);
    expect(state).toEqual({
      current_streak: 2,
      longest_streak: 2,
      last_played_date: "2026-07-02",
      freezes: 0,
    });
  });

  it("resets current to one when the ledger contains a date gap and no freezes", () => {
    const storage = memoryStorage();
    recordRoundOutcome("solved", "2026-07-01", 500, "PE", storage);
    recordRoundOutcome("solved", "2026-07-02", 500, "JP", storage);
    const { state } = recordRoundOutcome("solved", "2026-07-04", 500, "AR", storage);
    expect(state.current_streak).toBe(1);
    expect(state.longest_streak).toBe(2);
  });

  it("resets current to zero on either failure outcome", () => {
    const storage = memoryStorage();
    recordRoundOutcome("solved", "2026-07-01", 500, "PE", storage);
    const { state } = recordRoundOutcome("gave_up", "2026-07-02", 0, "JP", storage);
    expect(state.current_streak).toBe(0);
    expect(state.longest_streak).toBe(1);
  });

  it("derives the same result on every read instead of persisting new streak fields", () => {
    const storage = memoryStorage();
    recordRoundOutcome("solved", "2026-07-01", 500, "PE", storage);
    expect(readStreak(storage)).toEqual(readStreak(storage));
    expect(JSON.parse(storage.getItem(SAVE_STORAGE_KEY)!)).not.toHaveProperty("current_streak");
  });
});

describe("legacy streak migration", () => {
  it("preserves current and best, then continues from the ledger", () => {
    const storage = memoryStorage();
    storage.setItem(
      LEGACY_STREAK_STORAGE_KEY,
      JSON.stringify({
        current_streak: 4,
        longest_streak: 9,
        last_played_date: "2026-07-20",
      }),
    );

    expect(readStreak(storage)).toEqual({
      current_streak: 4,
      longest_streak: 9,
      last_played_date: "2026-07-20",
      freezes: 0,
    });
    const { state: continued } = recordRoundOutcome("solved", "2026-07-21", 500, "PE", storage);
    expect(continued.current_streak).toBe(5);
    expect(continued.longest_streak).toBe(9);
    expect(continued.freezes).toBe(1); // 5-day earn from migration baseline + day 5
  });

  it("imports legacy keys only once", () => {
    const storage = memoryStorage();
    storage.setItem(
      LEGACY_STREAK_STORAGE_KEY,
      JSON.stringify({
        current_streak: 3,
        longest_streak: 7,
        last_played_date: "2026-07-20",
      }),
    );
    readStreak(storage);
    storage.setItem(
      LEGACY_STREAK_STORAGE_KEY,
      JSON.stringify({
        current_streak: 99,
        longest_streak: 99,
        last_played_date: "2026-07-20",
      }),
    );
    expect(readStreak(storage).current_streak).toBe(3);
    expect(readStreak(storage).longest_streak).toBe(7);
  });
});

describe("streak freezes — earn cadence", () => {
  it(`earns 1 freeze every ${FREEZE_EARN_EVERY} consecutive solves (solved_late counts)`, () => {
    const storage = memoryStorage();
    solveDays(storage, "2026-07-01", 4);
    expect(readStreak(storage).freezes).toBe(0);

    const atFive = recordRoundOutcome("solved_late", "2026-07-05", 100, "AR", storage);
    expect(atFive.state.current_streak).toBe(5);
    expect(atFive.state.freezes).toBe(1);
    expect(atFive.notices.earnedFreeze).toBe(true);

    solveDays(storage, "2026-07-06", 4);
    const atTen = recordRoundOutcome("solved", "2026-07-10", 500, "CL", storage);
    expect(atTen.state.current_streak).toBe(10);
    expect(atTen.state.freezes).toBe(2);
    expect(atTen.notices.earnedFreeze).toBe(true);
  });

  it(`caps the bank at ${FREEZE_BANK_CAP}`, () => {
    const storage = memoryStorage();
    // 15 consecutive solves would earn 3 without a cap
    solveDays(storage, "2026-07-01", 15);
    expect(readStreak(storage).freezes).toBe(FREEZE_BANK_CAP);
    expect(readStreak(storage).current_streak).toBe(15);
  });
});

describe("streak freezes — auto-apply", () => {
  it("auto-applies one freeze to a single missed day and records a frozen ledger entry", () => {
    const storage = memoryStorage();
    solveDays(storage, "2026-07-01", 5); // earn 1 freeze, last = July 5
    expect(readStreak(storage).freezes).toBe(1);

    // Visit on July 7 after missing July 6
    const applied = applyPendingFreezes("2026-07-07", storage);
    expect(applied.notices.frozenDates).toEqual(["2026-07-06"]);
    expect(applied.state.freezes).toBe(0);
    expect(applied.state.current_streak).toBe(5);
    expect(applied.state.last_played_date).toBe("2026-07-06");
    expect(readSave(storage).ledger["2026-07-06"]).toEqual({
      outcome: "frozen",
      score: 0,
      target: "",
    });

    // Solve on July 7 continues the streak
    const next = recordRoundOutcome("solved", "2026-07-07", 500, "PE", storage);
    expect(next.state.current_streak).toBe(6);
  });

  it("auto-applies freezes chronologically across a multi-day gap", () => {
    const storage = memoryStorage();
    solveDays(storage, "2026-07-01", 10); // 2 freezes, last = July 10
    expect(readStreak(storage).freezes).toBe(2);

    // Miss July 11 and 12; visit July 13
    const applied = applyPendingFreezes("2026-07-13", storage);
    expect(applied.notices.frozenDates).toEqual(["2026-07-11", "2026-07-12"]);
    expect(applied.state.freezes).toBe(0);
    expect(applied.state.current_streak).toBe(10);
    expect(readSave(storage).ledger["2026-07-11"]?.outcome).toBe("frozen");
    expect(readSave(storage).ledger["2026-07-12"]?.outcome).toBe("frozen");
  });

  it("resets the streak when the gap exceeds banked freezes", () => {
    const storage = memoryStorage();
    solveDays(storage, "2026-07-01", 5); // 1 freeze
    // Miss 2 days (need 2 freezes); visit day 8
    const applied = applyPendingFreezes("2026-07-08", storage);
    expect(applied.notices.frozenDates).toEqual(["2026-07-06"]); // only one covered
    expect(applied.state.freezes).toBe(0);
    expect(applied.state.current_streak).toBe(0);
    expect(applied.notices.brokenStreak).toBe(5);
    // Residual gap day still has no entry
    expect(readSave(storage).ledger["2026-07-07"]).toBeUndefined();
  });

  it("does not spend freezes on a failed play day — failure still resets", () => {
    const storage = memoryStorage();
    solveDays(storage, "2026-07-01", 5);
    const failed = recordRoundOutcome("gave_up", "2026-07-06", 0, "JP", storage);
    expect(failed.state.current_streak).toBe(0);
    expect(failed.state.freezes).toBe(1); // freeze unused
    expect(failed.notices.brokenStreak).toBe(5);
    expect(readSave(storage).ledger["2026-07-06"]?.outcome).toBe("failed");
  });

  it("is idempotent: re-applying freezes does not double-spend", () => {
    const storage = memoryStorage();
    solveDays(storage, "2026-07-01", 5);
    applyPendingFreezes("2026-07-07", storage);
    const again = applyPendingFreezes("2026-07-07", storage);
    // Still reports the bridge for visit messaging (StrictMode-safe), but
    // does not write a second frozen row or spend more freezes.
    expect(again.notices.frozenDates).toEqual(["2026-07-06"]);
    expect(again.state.freezes).toBe(0);
    expect(Object.values(readSave(storage).ledger).filter((e) => e.outcome === "frozen")).toHaveLength(1);
  });
});

describe("streak freezes — messaging", () => {
  it("names covered dates kindly", () => {
    expect(freezeCoveredMessage(["2026-07-06"])).toBe("A streak freeze covered 2026-07-06");
    expect(freezeCoveredMessage(["2026-07-06", "2026-07-07"])).toBe(
      "Streak freezes covered 2026-07-06–2026-07-07",
    );
  });

  it("celebrates the ended run instead of shaming", () => {
    expect(streakBrokenMessage(34, 34)).toBe("Your 34-day streak ends — your longest yet.");
    expect(streakBrokenMessage(12, 40)).toBe("Your 12-day streak ends. Best remains 40.");
  });
});

describe("constants", () => {
  it("exports the earn cadence and bank cap", () => {
    expect(FREEZE_EARN_EVERY).toBe(5);
    expect(FREEZE_BANK_CAP).toBe(2);
  });
});
