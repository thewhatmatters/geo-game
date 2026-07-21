import { describe, expect, it } from "vitest";
import { createRound, reduceRound } from "./round";
import type { RoundEvent, RoundState } from "./round";
import { roundScore, TIME_BONUS_PER_SECOND, ZOOM_STEP_PENALTY } from "./score";
import { ZOOM_SENSITIVITY, ZOOM_STEP } from "./zoom";
import {
  breakdownLineSum,
  buildScoreBreakdown,
  outcomeHeadline,
} from "./scoreBreakdown";

/** "Peru": 4 unique letters — smallest convenient clean solve. */
const PERU = { name: "Peru", unique_letters: 4 };

function run(state: RoundState, ...events: RoundEvent[]): RoundState {
  return events.reduce(reduceRound, state);
}

const tick = (deltaSeconds: number): RoundEvent => ({ type: "TICK", deltaSeconds });
const guess = (letter: string): RoundEvent => ({ type: "GUESS", letter });
const oneZoomStep = (): RoundEvent => ({
  type: "ZOOM",
  deltaY: ZOOM_STEP / ZOOM_SENSITIVITY,
});

describe("buildScoreBreakdown", () => {
  it("line items sum exactly to RoundCore final score — fixed clean-solve scenario", () => {
    // Fixed reducer path: tick 20s (40 left) → P E R U correct streak
    // (100+150+200+200=650) → two zoom steps (−20) → solve.
    // Time bonus: 40 × 10 = 400. Final = 650 − 20 + 400 = 1030.
    const state = run(
      createRound(PERU, 10),
      tick(20),
      guess("P"),
      guess("E"),
      oneZoomStep(),
      oneZoomStep(),
      guess("R"),
      guess("U"),
    );

    expect(state.status).toBe("solved");
    expect(state.remainingSeconds).toBe(40);
    expect(roundScore(state)).toBe(650 - 2 * ZOOM_STEP_PENALTY + 40 * TIME_BONUS_PER_SECOND);

    const breakdown = buildScoreBreakdown(state);
    expect(breakdown.total).toBe(roundScore(state));
    expect(breakdownLineSum(breakdown)).toBe(breakdown.total);

    const byKey = Object.fromEntries(breakdown.lines.map((l) => [l.key, l]));
    expect(byKey.letters.amount).toBe(650);
    expect(byKey.letters.context).toBe("×2 PEAK");
    expect(byKey.mistakes.amount).toBe(0);
    expect(byKey.recon.amount).toBe(-2 * ZOOM_STEP_PENALTY);
    expect(byKey.time.amount).toBe(40 * TIME_BONUS_PER_SECOND);
    expect(byKey.total.amount).toBe(1030);
    // Clean books — no residual line.
    expect(byKey.residual).toBeUndefined();
  });

  it("solved_late shows an explicit 0 speed bonus and keeps earned points", () => {
    const state = run(
      createRound(PERU, 3),
      tick(60),
      guess("P"),
      guess("E"),
      guess("R"),
      guess("U"),
    );
    expect(state.status).toBe("solved_late");

    const breakdown = buildScoreBreakdown(state);
    expect(breakdown.lines.find((l) => l.key === "time")?.amount).toBe(0);
    expect(breakdown.total).toBe(650);
    expect(breakdownLineSum(breakdown)).toBe(breakdown.total);
  });

  it("locked_out totals 0 and line items still sum to it", () => {
    const state = run(
      createRound(PERU, 3),
      tick(60),
      guess("P"),
      guess("G"),
      guess("H"),
      guess("I"),
      guess("J"),
      guess("K"),
    );
    expect(state.status).toBe("locked_out");
    expect(roundScore(state)).toBe(0);

    const breakdown = buildScoreBreakdown(state);
    expect(breakdown.total).toBe(0);
    expect(breakdownLineSum(breakdown)).toBe(0);
    // Floor folds uncapped wrong-letter deltas into TRACE PENALTY so the
    // books can close without a residual when earned points were already
    // wiped mid-round.
    expect(breakdown.lines.find((l) => l.key === "time")?.amount).toBe(0);
  });

  it("gave_up totals 0 via ACCESS REVOKED residual of earned points", () => {
    const state = run(
      createRound(PERU, 3),
      tick(10),
      guess("P"),
      guess("E"),
      { type: "GIVE_UP" },
    );
    expect(state.status).toBe("gave_up");

    const breakdown = buildScoreBreakdown(state);
    expect(breakdown.total).toBe(0);
    expect(breakdownLineSum(breakdown)).toBe(0);
    // P+E earned 100+150 with no floor clipping — residual revokes the 250.
    expect(breakdown.lines.find((l) => l.key === "residual")).toMatchObject({
      label: "ACCESS REVOKED",
      amount: -250,
    });
  });

  it("uses intrusion-log labels for every line", () => {
    const state = run(
      createRound(PERU, 3),
      tick(5),
      guess("P"),
      guess("E"),
      guess("R"),
      guess("U"),
    );
    const labels = buildScoreBreakdown(state).lines.map((l) => l.label);
    expect(labels).toEqual([
      "DATA RECONSTITUTION",
      "TRACE PENALTY",
      "SURVEILLANCE COST",
      "SPEED BONUS",
      "TOTAL ACCESS",
    ]);
  });
});

describe("outcomeHeadline", () => {
  it("formats day number with outcome vocabulary", () => {
    expect(outcomeHeadline("solved", 9)).toBe("GEO #9 — ACCESS GRANTED");
    expect(outcomeHeadline("solved_late", 9)).toBe("GEO #9 — LATE ENTRY");
    expect(outcomeHeadline("locked_out", 9)).toBe("GEO #9 — LOCKOUT");
    expect(outcomeHeadline("gave_up", 9)).toBe("GEO #9 — ABORTED");
  });
});
