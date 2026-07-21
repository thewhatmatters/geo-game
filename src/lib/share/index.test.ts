import { describe, expect, it } from "vitest";
import { generateShareString, getDayNumber, guessPatternRow, LAUNCH_DATE } from "./index";
import type { ShareInput } from "./index";

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

  it("marks the trailing lockout wrongs distinctly", () => {
    const guesses = { S: "correct", X: "wrong", Q: "wrong", Z: "wrong" } as const;
    // Two attempts burnt after 0:00 → the last two wrongs are lockout wrongs.
    expect(guessPatternRow(guesses, 2)).toBe("🟩⬛🟥🟥");
  });
});

describe("generateShareString", () => {
  const base: ShareInput = {
    dayNumber: 12,
    status: "solved",
    remainingSeconds: 37.4,
    guesses: { S: "correct", X: "wrong" },
    targetName: "Switzerland",
    targetFlag: "🇨🇭",
  };

  it("solved: time remaining plus the country name and flag", () => {
    expect(generateShareString(base)).toBe(
      "GEO #12 — ACCESS GRANTED — 38s left\n🟩⬛\n🇨🇭 Switzerland",
    );
  });

  it("solved_late: no time claim, but still reveals the country", () => {
    const result = generateShareString({
      ...base,
      status: "solved_late",
      remainingSeconds: 0,
      guesses: { S: "correct", X: "wrong", Q: "wrong" },
      lockoutWrongCount: 1,
    });
    expect(result).toBe(
      "GEO #12 — ACCESS GRANTED — after the clock\n🟩⬛🟥\n🇨🇭 Switzerland",
    );
  });

  it("locked_out: keeps the country hidden", () => {
    const result = generateShareString({
      ...base,
      status: "locked_out",
      remainingSeconds: 0,
      guesses: { S: "correct", X: "wrong", Q: "wrong" },
      lockoutWrongCount: 2,
    });
    expect(result).toBe("GEO #12 — LOCKED OUT\n🟩🟥🟥");
    expect(result).not.toContain("Switzerland");
    expect(result).not.toContain("🇨🇭");
  });

  it("gave_up: keeps the country hidden", () => {
    const result = generateShareString({
      ...base,
      status: "gave_up",
      remainingSeconds: 21,
    });
    expect(result).toBe("GEO #12 — ABORTED\n🟩⬛");
    expect(result).not.toContain("Switzerland");
    expect(result).not.toContain("🇨🇭");
  });

  it("omits the pattern row entirely when the player never guessed", () => {
    expect(generateShareString({ ...base, status: "gave_up", guesses: {} })).toBe(
      "GEO #12 — ABORTED",
    );
  });

  it("falls back to the bare name when a territory has no flag emoji", () => {
    expect(generateShareString({ ...base, targetFlag: "" })).toBe(
      "GEO #12 — ACCESS GRANTED — 38s left\n🟩⬛\nSwitzerland",
    );
  });
});
