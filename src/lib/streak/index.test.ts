import { beforeEach, describe, expect, it } from "vitest";
import { readStreak, recordRoundOutcome } from "./index";

function fakeLocalStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    value: fakeLocalStorage(),
    writable: true,
    configurable: true,
  });
});

const day1 = "2026-07-01";
const day2 = "2026-07-02";
const day3 = "2026-07-03";
const dayAfterGap = "2026-07-05";

describe("readStreak", () => {
  it("returns a zeroed default state when nothing is persisted", () => {
    expect(readStreak()).toEqual({
      current_streak: 0,
      longest_streak: 0,
      last_played_date: null,
    });
  });
});

describe("recordRoundOutcome", () => {
  it("sets current_streak to 1 on the first solve", () => {
    const state = recordRoundOutcome("solved", day1);
    expect(state.current_streak).toBe(1);
    expect(state.longest_streak).toBe(1);
    expect(state.last_played_date).toBe(day1);
  });

  it("increments current_streak when solved on the consecutive local day", () => {
    recordRoundOutcome("solved", day1);
    const state = recordRoundOutcome("solved", day2);
    expect(state.current_streak).toBe(2);
    expect(state.longest_streak).toBe(2);
  });

  it("resets current_streak to 1 when a day is skipped", () => {
    recordRoundOutcome("solved", day1);
    recordRoundOutcome("solved", day2);
    const state = recordRoundOutcome("solved", dayAfterGap);
    expect(state.current_streak).toBe(1);
    expect(state.longest_streak).toBe(2);
  });

  it("resets current_streak to 0 on a failed round", () => {
    recordRoundOutcome("solved", day1);
    recordRoundOutcome("solved", day2);
    const state = recordRoundOutcome("failed", day3);
    expect(state.current_streak).toBe(0);
    expect(state.longest_streak).toBe(2);
  });

  it("keeps longest_streak at its prior maximum after a later reset", () => {
    recordRoundOutcome("solved", day1);
    recordRoundOutcome("solved", day2);
    recordRoundOutcome("failed", day3);
    const state = recordRoundOutcome("solved", dayAfterGap);
    expect(state.current_streak).toBe(1);
    expect(state.longest_streak).toBe(2);
  });

  it("persists state so a later readStreak reflects it without another guess", () => {
    recordRoundOutcome("solved", day1);
    expect(readStreak().current_streak).toBe(1);
  });

  it("is idempotent for repeated calls on the same local day", () => {
    recordRoundOutcome("solved", day1);
    const state = recordRoundOutcome("solved", day1);
    expect(state.current_streak).toBe(1);
    expect(state.longest_streak).toBe(1);
  });
});
