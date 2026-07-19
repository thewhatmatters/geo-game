import { describe, expect, it } from "vitest";
import {
  applyScoreDelta,
  comboMultiplier,
  computeScore,
  correctLetterPoints,
  timeBonus,
  wrongLetterPenalty,
  COMBO_MULTIPLIER_STEPS,
  CORRECT_LETTER_POINTS,
  SCORE_FLOOR,
  TIME_BONUS_PER_SECOND,
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

describe("timeBonus", () => {
  it("pays 10/second left, on a clean solve only", () => {
    expect(timeBonus("solved", 37)).toBe(37 * TIME_BONUS_PER_SECOND);
  });

  it("pays nothing for a late solve — there are no seconds left to convert", () => {
    expect(timeBonus("solved_late", 0)).toBe(0);
    expect(timeBonus("solved_late", 12)).toBe(0); // defensive: solved_late implies 0 anyway
  });

  it("pays nothing while running or on either failure", () => {
    expect(timeBonus("running", 37)).toBe(0);
    expect(timeBonus("locked_out", 0)).toBe(0);
    expect(timeBonus("gave_up", 37)).toBe(0);
  });

  it("pays whole seconds only", () => {
    expect(timeBonus("solved", 36.9)).toBe(36 * TIME_BONUS_PER_SECOND);
  });
});

describe("computeScore", () => {
  it("shows the running total while playing — the bonus lands on solve, not before", () => {
    expect(computeScore("running", 350, 37)).toBe(350);
  });

  it("adds the time bonus on a clean solve", () => {
    expect(computeScore("solved", 350, 37)).toBe(350 + 370);
  });

  it("keeps a late solve's earned points, without a bonus", () => {
    expect(computeScore("solved_late", 350, 0)).toBe(350);
  });

  it("zeroes both failure outcomes — no reward for not solving", () => {
    expect(computeScore("locked_out", 350, 0)).toBe(0);
    expect(computeScore("gave_up", 350, 37)).toBe(0);
  });
});
