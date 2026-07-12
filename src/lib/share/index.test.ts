import { describe, expect, it } from "vitest";
import { generateShareString, getDayNumber, guessPatternRow, LAUNCH_DATE } from "./index";

describe("getDayNumber", () => {
  it("returns 1 on the launch date", () => {
    expect(getDayNumber(new Date(`${LAUNCH_DATE}T12:00:00Z`))).toBe(1);
  });

  it("increments by 1 per UTC calendar day", () => {
    expect(getDayNumber(new Date("2026-07-12T00:00:00Z"))).toBe(2);
    expect(getDayNumber(new Date("2026-07-21T23:59:59Z"))).toBe(11);
  });
});

describe("guessPatternRow", () => {
  it("renders one square per guess in guess order, correct vs wrong only", () => {
    const guesses = { S: "correct", X: "wrong", W: "correct" } as const;
    expect(guessPatternRow(guesses)).toBe("🟩⬛🟩");
  });

  it("returns an empty string with no guesses", () => {
    expect(guessPatternRow({})).toBe("");
  });
});

describe("generateShareString", () => {
  it("includes the country name and time remaining when solved", () => {
    const result = generateShareString({
      dayNumber: 12,
      status: "solved",
      remainingSeconds: 37.4,
      guesses: { S: "correct", X: "wrong" },
      targetName: "Switzerland",
    });
    expect(result).toBe("Geo #12 — Solved with 38s left\n🟩⬛\nSwitzerland");
  });

  it("omits the country name entirely when failed", () => {
    const result = generateShareString({
      dayNumber: 12,
      status: "failed",
      remainingSeconds: 0,
      guesses: { S: "correct", X: "wrong" },
      targetName: "Switzerland",
    });
    expect(result).toBe("Geo #12 — Failed\n🟩⬛");
    expect(result).not.toContain("Switzerland");
  });
});
