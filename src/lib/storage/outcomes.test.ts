import { describe, expect, it } from "vitest";
import { readSave, recordOutcome, SAVE_SCHEMA_VERSION, SAVE_STORAGE_KEY } from "./outcomes";

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

describe("outcome save", () => {
  it.each([
    ["solved", "solved"],
    ["solved_late", "solved_late"],
    ["locked_out", "failed"],
    ["gave_up", "failed"],
  ] as const)("writes %s as a dated %s ledger entry", (status, outcome) => {
    const storage = memoryStorage();
    recordOutcome("2026-07-21", status, 275, "PE", storage);
    expect(readSave(storage).ledger["2026-07-21"]).toEqual({ outcome, score: 275, target: "PE" });
  });

  it("writes in-time and late trophies for solves", () => {
    const storage = memoryStorage();
    recordOutcome("2026-07-21", "solved", 400, "PE", storage);
    recordOutcome("2026-07-22", "solved_late", 250, "JP", storage);
    expect(readSave(storage).trophyMap).toEqual({
      PE: { tier: "in_time", date: "2026-07-21" },
      JP: { tier: "late", date: "2026-07-22" },
    });
  });

  it.each(["locked_out", "gave_up"] as const)("leaves no trophy for %s", (status) => {
    const storage = memoryStorage();
    recordOutcome("2026-07-21", status, 0, "PE", storage);
    expect(readSave(storage).trophyMap).toEqual({});
  });

  it("persists a schema version with the save", () => {
    const storage = memoryStorage();
    readSave(storage);
    expect(JSON.parse(storage.getItem(SAVE_STORAGE_KEY)!)).toMatchObject({ version: SAVE_SCHEMA_VERSION });
  });
});
