import { describe, expect, it } from "vitest";
import { countdownToNextRound, formatCountdown, msUntilNextLocalMidnight } from "./nextRound";

describe("msUntilNextLocalMidnight", () => {
  it("counts the remaining local day", () => {
    // Local-time constructor on purpose — the boundary is the player's own
    // midnight, whatever timezone the test runs in.
    const now = new Date(2026, 6, 21, 23, 59, 30);
    expect(msUntilNextLocalMidnight(now)).toBe(30_000);
  });

  it("returns a full day at exactly local midnight", () => {
    const now = new Date(2026, 6, 21, 0, 0, 0);
    expect(msUntilNextLocalMidnight(now)).toBe(24 * 60 * 60 * 1000);
  });

  it("is always positive", () => {
    const now = new Date(2026, 6, 21, 12, 34, 56, 789);
    expect(msUntilNextLocalMidnight(now)).toBeGreaterThan(0);
  });
});

describe("formatCountdown", () => {
  it("zero-pads hours, minutes and seconds", () => {
    expect(formatCountdown(((1 * 60 + 2) * 60 + 3) * 1000)).toBe("01:02:03");
  });

  it("rounds partial seconds up so the readout never lies about being done", () => {
    expect(formatCountdown(1)).toBe("00:00:01");
    expect(formatCountdown(0)).toBe("00:00:00");
  });

  it("clamps negatives to zero", () => {
    expect(formatCountdown(-5000)).toBe("00:00:00");
  });
});

describe("countdownToNextRound", () => {
  it("formats the remaining local day", () => {
    expect(countdownToNextRound(new Date(2026, 6, 21, 21, 30, 0))).toBe("02:30:00");
  });
});
