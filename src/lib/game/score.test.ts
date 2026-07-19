import { describe, expect, it } from "vitest";
import {
  applyScoreDelta,
  comboMultiplier,
  computeScore,
  correctLetterPoints,
  wrongLetterPenalty,
  COMBO_MULTIPLIER_STEPS,
  CORRECT_LETTER_POINTS,
  SCORE_FLOOR,
} from "./score";

describe("comboMultiplier", () => {
  it("steps x1 -> x1.5 -> x2 over consecutive correct letters", () => {
    expect(comboMultiplier(1)).toBe(1);
    expect(comboMultiplier(2)).toBe(1.5);
    expect(comboMultiplier(3)).toBe(2);
  });

  it("caps at the ladder's last step", () => {
    expect(comboMultiplier(4)).toBe(2);
    expect(comboMultiplier(50)).toBe(COMBO_MULTIPLIER_STEPS[COMBO_MULTIPLIER_STEPS.length - 1]);
  });

  it("treats a broken streak as x1", () => {
    expect(comboMultiplier(0)).toBe(1);
  });
});

describe("correctLetterPoints", () => {
  it("scales the base award by the combo multiplier", () => {
    expect(correctLetterPoints(1)).toBe(CORRECT_LETTER_POINTS);
    expect(correctLetterPoints(2)).toBe(CORRECT_LETTER_POINTS * 1.5);
    expect(correctLetterPoints(3)).toBe(CORRECT_LETTER_POINTS * 2);
    expect(correctLetterPoints(9)).toBe(CORRECT_LETTER_POINTS * 2);
  });
});

describe("wrongLetterPenalty (tiers key off UNIQUE letters, not name length)", () => {
  it("charges 200 for a <=5 unique-letter target", () => {
    expect(wrongLetterPenalty(1)).toBe(200);
    expect(wrongLetterPenalty(4)).toBe(200);
    expect(wrongLetterPenalty(5)).toBe(200);
  });

  it("charges 150 for a 6-9 unique-letter target", () => {
    expect(wrongLetterPenalty(6)).toBe(150);
    expect(wrongLetterPenalty(9)).toBe(150);
  });

  it("charges 100 for a 10+ unique-letter target", () => {
    expect(wrongLetterPenalty(10)).toBe(100);
    expect(wrongLetterPenalty(26)).toBe(100);
  });
});

describe("applyScoreDelta", () => {
  it("adds and subtracts normally above the floor", () => {
    expect(applyScoreDelta(0, 100)).toBe(100);
    expect(applyScoreDelta(300, -150)).toBe(150);
  });

  it("holds the floor instead of going negative", () => {
    expect(applyScoreDelta(50, -200)).toBe(SCORE_FLOOR);
    expect(applyScoreDelta(0, -200)).toBe(SCORE_FLOOR);
  });
});

describe("computeScore", () => {
  it("shows the running total while playing and on solve", () => {
    expect(computeScore("running", 350)).toBe(350);
    expect(computeScore("solved", 350)).toBe(350);
  });

  it("zeroes a failed round — no reward for not solving", () => {
    expect(computeScore("failed", 350)).toBe(0);
  });
});
