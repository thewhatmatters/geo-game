import { describe, expect, it } from "vitest";
import { createRound, reduceRound } from "./round";
import { getDailyCountry } from "./dailyCountry";
import { readRecordedRound, recordCompletedRound } from "./useGameRound";

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

describe("recorded daily round", () => {
  it("restores a terminal result for the same local date", () => {
    const storage = memoryStorage();
    const target = getDailyCountry("2026-07-21").target;
    const completed = reduceRound(createRound(target, 2), { type: "GIVE_UP" });
    recordCompletedRound("2026-07-21", completed, storage);
    expect(readRecordedRound("2026-07-21", target, 2, storage)).toEqual(completed);
  });

  it("does not leak a recorded result into the next local date", () => {
    const storage = memoryStorage();
    const target = getDailyCountry("2026-07-21").target;
    const completed = reduceRound(createRound(target, 2), { type: "GIVE_UP" });
    recordCompletedRound("2026-07-21", completed, storage);
    expect(readRecordedRound("2026-07-22", target, 2, storage).status).toBe("running");
  });
});
