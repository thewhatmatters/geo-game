import { describe, expect, it } from "vitest";
import { computeScore, SCORE_BASE_POINTS, SCORE_SECONDS_MULTIPLIER } from "./score";

describe("computeScore", () => {
  it("is live (not zero) during a running round", () => {
    expect(computeScore("running", 45)).toBe(SCORE_BASE_POINTS + 45 * SCORE_SECONDS_MULTIPLIER);
  });

  it("is 0 for a failed round, regardless of remaining time", () => {
    expect(computeScore("failed", 0)).toBe(0);
    expect(computeScore("failed", 30)).toBe(0);
  });

  it("adds the base points plus the seconds multiplier on solve", () => {
    expect(computeScore("solved", 45)).toBe(SCORE_BASE_POINTS + 45 * SCORE_SECONDS_MULTIPLIER);
  });

  it("still awards the base points on a last-second solve", () => {
    expect(computeScore("solved", 0)).toBe(SCORE_BASE_POINTS);
  });

  it("rounds a fractional remaining-seconds value", () => {
    expect(computeScore("solved", 12.6)).toBe(SCORE_BASE_POINTS + Math.round(12.6 * SCORE_SECONDS_MULTIPLIER));
  });
});
