import { describe, expect, it } from "vitest";
import { readStreak, recordRoundOutcome } from "./index";
import { LEGACY_STREAK_STORAGE_KEY, SAVE_STORAGE_KEY } from "../storage/outcomes";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}

describe("ledger-derived streak", () => {
  it("increments across consecutive solve days, including a late solve", () => {
    const storage = memoryStorage();
    recordRoundOutcome("solved", "2026-07-01", 500, "PE", storage);
    const state = recordRoundOutcome("solved_late", "2026-07-02", 200, "JP", storage);
    expect(state).toEqual({ current_streak: 2, longest_streak: 2, last_played_date: "2026-07-02" });
  });

  it("resets current to one when the ledger contains a date gap", () => {
    const storage = memoryStorage();
    recordRoundOutcome("solved", "2026-07-01", 500, "PE", storage);
    recordRoundOutcome("solved", "2026-07-02", 500, "JP", storage);
    const state = recordRoundOutcome("solved", "2026-07-04", 500, "AR", storage);
    expect(state.current_streak).toBe(1);
    expect(state.longest_streak).toBe(2);
  });

  it("resets current to zero on either failure outcome", () => {
    const storage = memoryStorage();
    recordRoundOutcome("solved", "2026-07-01", 500, "PE", storage);
    const state = recordRoundOutcome("gave_up", "2026-07-02", 0, "JP", storage);
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
    storage.setItem(LEGACY_STREAK_STORAGE_KEY, JSON.stringify({
      current_streak: 4,
      longest_streak: 9,
      last_played_date: "2026-07-20",
    }));

    expect(readStreak(storage)).toEqual({
      current_streak: 4,
      longest_streak: 9,
      last_played_date: "2026-07-20",
    });
    const continued = recordRoundOutcome("solved", "2026-07-21", 500, "PE", storage);
    expect(continued.current_streak).toBe(5);
    expect(continued.longest_streak).toBe(9);
  });

  it("imports legacy keys only once", () => {
    const storage = memoryStorage();
    storage.setItem(LEGACY_STREAK_STORAGE_KEY, JSON.stringify({
      current_streak: 3,
      longest_streak: 7,
      last_played_date: "2026-07-20",
    }));
    readStreak(storage);
    storage.setItem(LEGACY_STREAK_STORAGE_KEY, JSON.stringify({
      current_streak: 99,
      longest_streak: 99,
      last_played_date: "2026-07-20",
    }));
    expect(readStreak(storage).current_streak).toBe(3);
    expect(readStreak(storage).longest_streak).toBe(7);
  });
});
