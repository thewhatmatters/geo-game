import { describe, expect, it } from "vitest";
import { encodeSaveCode, exportSaveCode, importSaveCode, mergeSaves } from "./index";
import { frameCode } from "./codec";
import { SAVE_SCHEMA_VERSION, readSave, recordOutcome, writeSave } from "../storage/outcomes";
import type { GeoSave } from "../storage/outcomes";
import { buildHeatmap, heatmapTotals } from "../stats/heatmap";
import { readStreak } from "../streak";

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

function save(ledger: GeoSave["ledger"], trophyMap: GeoSave["trophyMap"] = {}): GeoSave {
  return { version: SAVE_SCHEMA_VERSION, ledger, trophyMap };
}

describe("mergeSaves", () => {
  it("unions days neither side shares", () => {
    const merged = mergeSaves(
      save({ "2026-07-18": { outcome: "solved", score: 900, target: "PER" } }),
      save({ "2026-07-19": { outcome: "solved", score: 800, target: "JPN" } }),
    );
    expect(Object.keys(merged.ledger).sort()).toEqual(["2026-07-18", "2026-07-19"]);
  });

  it("keeps the better outcome when both sides recorded the same day", () => {
    const merged = mergeSaves(
      save({ "2026-07-18": { outcome: "failed", score: 0, target: "PER" } }),
      save({ "2026-07-18": { outcome: "solved", score: 900, target: "PER" } }),
    );
    expect(merged.ledger["2026-07-18"].outcome).toBe("solved");
  });

  it("never downgrades a local solve to an imported failure", () => {
    const merged = mergeSaves(
      save({ "2026-07-18": { outcome: "solved_late", score: 200, target: "PER" } }),
      save({ "2026-07-18": { outcome: "frozen", score: 0, target: "" } }),
    );
    expect(merged.ledger["2026-07-18"]).toEqual({ outcome: "solved_late", score: 200, target: "PER" });
  });

  it("breaks a same-outcome tie on score", () => {
    const merged = mergeSaves(
      save({ "2026-07-18": { outcome: "solved", score: 400, target: "PER" } }),
      save({ "2026-07-18": { outcome: "solved", score: 900, target: "PER" } }),
    );
    expect(merged.ledger["2026-07-18"].score).toBe(900);
  });

  it("keeps the better trophy tier and the earlier claim date", () => {
    const merged = mergeSaves(
      save({}, { PER: { tier: "late", date: "2026-07-18" }, JPN: { tier: "in_time", date: "2026-07-20" } }),
      save({}, { PER: { tier: "in_time", date: "2026-07-10" }, JPN: { tier: "in_time", date: "2026-07-02" } }),
    );
    expect(merged.trophyMap).toEqual({
      PER: { tier: "in_time", date: "2026-07-10" },
      JPN: { tier: "in_time", date: "2026-07-02" },
    });
  });

  it("keeps the highest legacy streak baseline from either side", () => {
    const local = { ...save({}), streakMigration: { current_streak: 2, longest_streak: 9, last_played_date: "2026-07-01" } };
    const incoming = { ...save({}), streakMigration: { current_streak: 5, longest_streak: 4, last_played_date: "2026-07-05" } };
    expect(mergeSaves(local, incoming).streakMigration).toEqual({
      current_streak: 5,
      longest_streak: 9,
      last_played_date: "2026-07-05",
    });
  });
});

describe("importSaveCode", () => {
  it("restores a wiped device from an exported code", () => {
    const original = memoryStorage();
    recordOutcome("2026-07-18", "solved", 940, "PER", original);
    recordOutcome("2026-07-19", "solved", 880, "JPN", original);
    recordOutcome("2026-07-20", "solved_late", 300, "ISL", original);
    const code = exportSaveCode(original);

    // A fresh device — the browser-wipe case.
    const wiped = memoryStorage();
    expect(readSave(wiped).ledger).toEqual({});

    const result = importSaveCode(code, wiped);
    expect(result.ok).toBe(true);
    expect(readSave(wiped)).toEqual(readSave(original));
  });

  it("restores the derived views the player actually sees", () => {
    const original = memoryStorage();
    recordOutcome("2026-07-18", "solved", 940, "PER", original);
    recordOutcome("2026-07-19", "solved", 880, "JPN", original);
    recordOutcome("2026-07-20", "solved", 700, "ISL", original);
    const before = {
      streak: readStreak(original, "2026-07-20"),
      totals: heatmapTotals(buildHeatmap(readSave(original).ledger, "2026-07-20", 4)),
      countries: Object.keys(readSave(original).trophyMap).sort(),
    };

    const wiped = memoryStorage();
    importSaveCode(exportSaveCode(original), wiped);

    expect(readStreak(wiped, "2026-07-20")).toEqual(before.streak);
    expect(heatmapTotals(buildHeatmap(readSave(wiped).ledger, "2026-07-20", 4))).toEqual(before.totals);
    expect(Object.keys(readSave(wiped).trophyMap).sort()).toEqual(before.countries);
  });

  it("merges into a longer local history instead of clobbering it", () => {
    const local = memoryStorage();
    recordOutcome("2026-07-18", "solved", 900, "PER", local);
    recordOutcome("2026-07-19", "gave_up", 0, "JPN", local);

    const other = memoryStorage();
    recordOutcome("2026-07-19", "solved", 500, "JPN", other);
    recordOutcome("2026-07-20", "solved", 600, "ISL", other);

    importSaveCode(exportSaveCode(other), local);
    const merged = readSave(local);
    expect(Object.keys(merged.ledger).sort()).toEqual(["2026-07-18", "2026-07-19", "2026-07-20"]);
    // The day both sides claim keeps the better of the two.
    expect(merged.ledger["2026-07-19"].outcome).toBe("solved");
    expect(merged.trophyMap.PER).toBeDefined();
  });

  it.each([
    ["gibberish", "not-a-code"],
    ["an empty paste", "   "],
    ["a corrupted code", "GEO1.QUJD.ZZZZ"],
  ])("rejects %s with a message and touches nothing", (_label, code) => {
    const storage = memoryStorage();
    recordOutcome("2026-07-18", "solved", 900, "PER", storage);
    const before = JSON.stringify(readSave(storage));

    const result = importSaveCode(code, storage);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message.length).toBeGreaterThan(0);
    expect(JSON.stringify(readSave(storage))).toBe(before);
  });

  it("rejects a code from a newer version without touching local state", () => {
    const storage = memoryStorage();
    recordOutcome("2026-07-18", "solved", 900, "PER", storage);
    const before = JSON.stringify(readSave(storage));

    const result = importSaveCode(frameCode([SAVE_SCHEMA_VERSION, [], [], []], "GEO9"), storage);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toMatch(/newer version/i);
    expect(JSON.stringify(readSave(storage))).toBe(before);
  });

  it("accepts and upgrades a legacy v0 code", () => {
    const storage = memoryStorage();
    const legacy = frameCode([0, [[2390, 0, 940, "PER"]]]);
    const result = importSaveCode(legacy, storage);
    expect(result.ok).toBe(true);
    expect(result.ok && result.message).toMatch(/upgraded/i);
    expect(readSave(storage).trophyMap.PER?.tier).toBe("in_time");
  });

  it("re-exports an imported code to the same code", () => {
    const original = memoryStorage();
    recordOutcome("2026-07-18", "solved", 940, "PER", original);
    recordOutcome("2026-07-19", "locked_out", 0, "JPN", original);
    const code = exportSaveCode(original);

    const wiped = memoryStorage();
    importSaveCode(code, wiped);
    expect(exportSaveCode(wiped)).toBe(code);
  });

  it("carries the legacy streak baseline across a wipe", () => {
    const original = memoryStorage();
    writeSave(
      {
        ...readSave(original),
        streakMigration: { current_streak: 4, longest_streak: 12, last_played_date: "2026-07-17" },
      },
      original,
    );
    const wiped = memoryStorage();
    importSaveCode(encodeSaveCode(readSave(original)), wiped);
    expect(readSave(wiped).streakMigration).toEqual({
      current_streak: 4,
      longest_streak: 12,
      last_played_date: "2026-07-17",
    });
  });
});
