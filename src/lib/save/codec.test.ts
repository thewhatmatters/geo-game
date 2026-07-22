import { describe, expect, it } from "vitest";
import {
  SAVE_CODE_PREFIX,
  checksum,
  decodeSaveCode,
  encodeSaveCode,
  frameCode,
} from "./codec";
import { SAVE_SCHEMA_VERSION } from "../storage/outcomes";
import type { GeoSave } from "../storage/outcomes";

const SAVE: GeoSave = {
  version: SAVE_SCHEMA_VERSION,
  ledger: {
    "2026-07-18": { outcome: "solved", score: 940, target: "PER" },
    "2026-07-19": { outcome: "frozen", score: 0, target: "" },
    "2026-07-20": { outcome: "failed", score: 0, target: "ISL" },
    "2026-07-21": { outcome: "solved_late", score: 310, target: "JPN" },
  },
  trophyMap: {
    PER: { tier: "in_time", date: "2026-07-18" },
    JPN: { tier: "late", date: "2026-07-21" },
  },
  streakMigration: { current_streak: 3, longest_streak: 11, last_played_date: "2026-07-17" },
};

function ok(result: ReturnType<typeof decodeSaveCode>) {
  if (!result.ok) throw new Error(`expected a decodable code, got: ${result.message}`);
  return result;
}

describe("save code codec", () => {
  it("exports a versioned, checksummed code", () => {
    const code = encodeSaveCode(SAVE);
    const [prefix, payload, stamp] = code.split(".");
    expect(prefix).toBe(SAVE_CODE_PREFIX);
    expect(payload.length).toBeGreaterThan(0);
    expect(stamp).toBe(checksum(payload));
  });

  it("round-trips the full state exactly", () => {
    expect(ok(decodeSaveCode(encodeSaveCode(SAVE))).save).toEqual(SAVE);
  });

  it("round-trips an empty save", () => {
    const empty: GeoSave = { version: SAVE_SCHEMA_VERSION, ledger: {}, trophyMap: {} };
    expect(ok(decodeSaveCode(encodeSaveCode(empty))).save).toEqual(empty);
  });

  it("survives a paste that picked up whitespace and newlines", () => {
    const code = encodeSaveCode(SAVE);
    const mangled = `  ${code.slice(0, 12)}\n${code.slice(12)}  `;
    expect(ok(decodeSaveCode(mangled)).save).toEqual(SAVE);
  });

  it("accepts a lowercased prefix", () => {
    const code = encodeSaveCode(SAVE);
    expect(ok(decodeSaveCode(code.replace(SAVE_CODE_PREFIX, SAVE_CODE_PREFIX.toLowerCase()))).save)
      .toEqual(SAVE);
  });

  it.each([
    ["empty", "", "empty"],
    ["whitespace only", "   \n ", "empty"],
    ["free text", "hello world", "not_a_save_code"],
    ["prefix only", "GEO1", "not_a_save_code"],
    ["missing checksum", "GEO1.AAAA", "not_a_save_code"],
    ["empty payload", "GEO1..ABC", "not_a_save_code"],
  ] as const)("rejects %s", (_label, input, reason) => {
    const result = decodeSaveCode(input);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe(reason);
    expect(result.ok === false && result.message.length).toBeGreaterThan(0);
  });

  it("rejects a truncated code via the checksum", () => {
    const code = encodeSaveCode(SAVE);
    const [prefix, payload, stamp] = code.split(".");
    const result = decodeSaveCode(`${prefix}.${payload.slice(0, -4)}.${stamp}`);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("checksum");
  });

  it("rejects a single-character typo via the checksum", () => {
    const code = encodeSaveCode(SAVE);
    const [prefix, payload, stamp] = code.split(".");
    const swapped = payload[3] === "A" ? "B" : "A";
    const typo = `${payload.slice(0, 3)}${swapped}${payload.slice(4)}`;
    const result = decodeSaveCode(`${prefix}.${typo}.${stamp}`);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("checksum");
  });

  it("rejects a well-framed code whose payload is not a save", () => {
    const result = decodeSaveCode(frameCode({ not: "a save" }));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("corrupt");
  });

  it("rejects a well-framed code with a bad ledger row", () => {
    const result = decodeSaveCode(frameCode([SAVE_SCHEMA_VERSION, ["PER"], [["nope", 0, 0, 0]], []]));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("corrupt");
  });

  it("rejects an out-of-range outcome code", () => {
    const result = decodeSaveCode(frameCode([SAVE_SCHEMA_VERSION, ["PER"], [[2400, 9, 0, 0]], []]));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("corrupt");
  });

  it("rejects a code from a newer codec by name", () => {
    const result = decodeSaveCode(frameCode([SAVE_SCHEMA_VERSION, [], [], []], "GEO9"));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("newer_codec");
    expect(result.ok === false && result.message).toMatch(/newer version/i);
  });

  it("rejects a payload from a newer save schema", () => {
    const result = decodeSaveCode(frameCode([SAVE_SCHEMA_VERSION + 1, [], [], []]));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("newer_schema");
    expect(result.ok === false && result.message).toMatch(/newer data/i);
  });

  it("migrates a v0 (pre-trophy-map) payload by deriving trophies from the ledger", () => {
    // v0 carried the version + ledger only.
    const legacy = frameCode([
      0,
      [
        [2390, 0, 940, "PER"], // solved
        [2391, 1, 310, "JPN"], // solved_late
        [2392, 2, 0, "ISL"], // failed — no trophy
        [2393, 3, 0, ""], // frozen — no trophy
      ],
    ]);
    const result = ok(decodeSaveCode(legacy));
    expect(result.migratedFrom).toBe(0);
    expect(result.save.version).toBe(SAVE_SCHEMA_VERSION);
    expect(Object.keys(result.save.ledger)).toHaveLength(4);
    expect(result.save.trophyMap).toEqual({
      PER: { tier: "in_time", date: expect.any(String) },
      JPN: { tier: "late", date: expect.any(String) },
    });
  });

  it("reports no migration for a current-version code", () => {
    expect(ok(decodeSaveCode(encodeSaveCode(SAVE))).migratedFrom).toBeNull();
  });

  it("keeps a year of history to a pasteable length", () => {
    const ledger: GeoSave["ledger"] = {};
    for (let day = 0; day < 365; day++) {
      const date = new Date(Date.UTC(2026, 0, 1) + day * 86_400_000).toISOString().slice(0, 10);
      ledger[date] = { outcome: "solved", score: 800 + day, target: "PER" };
    }
    const code = encodeSaveCode({ version: SAVE_SCHEMA_VERSION, ledger, trophyMap: {} });
    // Day offsets + an interned country dictionary keep a row near 22 chars;
    // dated JSON with inline codes runs half again as long.
    expect(code.length).toBeLessThan(365 * 23);
    expect(ok(decodeSaveCode(code)).save.ledger).toEqual(ledger);
  });
});
