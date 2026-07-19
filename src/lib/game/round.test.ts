import { describe, expect, it } from "vitest";
import {
  createRound,
  reduceRound,
  displayChars,
  outlineCompletion,
  neighborCompletion,
  latestScoreEvent,
  ROUND_DURATION_SECONDS,
} from "./round";
import type { RoundEvent, RoundState } from "./round";
import { ZOOM_SENSITIVITY, ZOOM_STEP } from "./zoom";

/** "Chad": 4 unique letters — the old harshest penalty tier. */
const CHAD = { name: "Chad", unique_letters: 4 };
/** "Peru": 4 unique letters, no repeats — smallest convenient solve. */
const PERU = { name: "Peru", unique_letters: 4 };

function run(state: RoundState, ...events: RoundEvent[]): RoundState {
  return events.reduce(reduceRound, state);
}

const tick = (deltaSeconds: number): RoundEvent => ({ type: "TICK", deltaSeconds });
const guess = (letter: string): RoundEvent => ({ type: "GUESS", letter });
/** deltaY that crosses exactly one ZOOM_STEP of zoom-out. */
const oneZoomStep = (): RoundEvent => ({ type: "ZOOM", deltaY: ZOOM_STEP / ZOOM_SENSITIVITY });

describe("clock rules (pure pacer — ported from GameClock)", () => {
  it("starts at the 60-second default, running", () => {
    const state = createRound(CHAD, 3);
    expect(state.status).toBe("running");
    expect(state.remainingSeconds).toBe(ROUND_DURATION_SECONDS);
  });

  it("accepts a custom initial duration", () => {
    expect(createRound(CHAD, 3, 10).remainingSeconds).toBe(10);
  });

  it("ticks down by an explicit delta", () => {
    const state = run(createRound(CHAD, 3), tick(12.5));
    expect(state.remainingSeconds).toBe(47.5);
  });

  it("clamps at 0 and keeps running — 0:00 does not end or fail the round", () => {
    const state = run(createRound(CHAD, 3, 5), tick(10));
    expect(state.status).toBe("running");
    expect(state.remainingSeconds).toBe(0);
  });

  it("further ticks at 0 are a no-op (same state reference)", () => {
    const zero = run(createRound(CHAD, 3, 5), tick(10));
    expect(run(zero, tick(5))).toBe(zero);
  });

  it("guessing still works after the clock reaches 0 (transitional: round simply continues)", () => {
    const state = run(createRound(PERU, 3), tick(60), guess("P"));
    expect(state.status).toBe("running");
    expect(state.guesses).toEqual({ P: "correct" });
    expect(state.remainingSeconds).toBe(0);
  });

  it("give-up transitions to failed immediately regardless of remaining time", () => {
    const state = run(createRound(CHAD, 3), { type: "GIVE_UP" });
    expect(state.status).toBe("failed");
    expect(state.remainingSeconds).toBe(60);
  });

  it("ignores further ticks and guesses once failed", () => {
    const state = run(createRound(CHAD, 3), { type: "GIVE_UP" }, tick(5), guess("X"));
    expect(state.status).toBe("failed");
    expect(state.remainingSeconds).toBe(60);
    expect(state.guesses).toEqual({});
  });
});

describe("guessing", () => {
  it("locks a correct letter into guesses and reveals every instance", () => {
    const state = run(createRound(CHAD, 3), guess("a"));
    expect(state.guesses).toEqual({ A: "correct" });
    const chars = displayChars(state);
    expect(chars.map((c) => (c.revealed ? c.char : "_")).join("")).toBe("_HA_".replace("H", "_"));
  });

  it("ignores non-letters and repeat guesses", () => {
    const first = run(createRound(CHAD, 3), guess("a"));
    expect(run(first, guess("a"))).toBe(first);
    expect(run(first, guess("3"))).toBe(first);
    expect(run(first, guess(" "))).toBe(first);
  });

  it("a wrong guess is recorded but never steals time (the old tier penalty is gone)", () => {
    const state = run(createRound(CHAD, 3), guess("Z"));
    expect(state.guesses).toEqual({ Z: "wrong" });
    expect(state.remainingSeconds).toBe(60);
    expect(state.status).toBe("running");
    expect(latestScoreEvent(state)).toBeNull();
  });

  it("a wrong guess at 1s remaining no longer fails the round", () => {
    const state = run(createRound(CHAD, 3), tick(59), guess("Z"));
    expect(state.status).toBe("running");
    expect(state.remainingSeconds).toBe(1);
  });

  it("consecutive correct guesses never add time (the old streak bonus is gone)", () => {
    let state = run(createRound(PERU, 3), tick(1)); // 59 remaining
    state = run(state, guess("P"), guess("E"), guess("R"));
    expect(state.correctStreak).toBe(3);
    expect(state.remainingSeconds).toBe(59);
    expect(latestScoreEvent(state)).toBeNull();
  });

  it("a wrong guess resets the correct streak", () => {
    let state = run(createRound(PERU, 3), guess("P"), guess("E"), guess("Z"));
    expect(state.correctStreak).toBe(0);
    state = run(state, guess("R"));
    expect(state.correctStreak).toBe(1);
  });

  it("solves the round when every unique letter is correct", () => {
    const state = run(createRound(PERU, 3), guess("P"), guess("E"), guess("R"), guess("U"));
    expect(state.status).toBe("solved");
    expect(displayChars(state).every((c) => c.revealed)).toBe(true);
  });

  it("time is never mutated by any mix of guess events", () => {
    const before = run(createRound(CHAD, 3), tick(10)); // 50 remaining
    const after = run(before, guess("C"), guess("Z"), guess("X"), guess("H"), guess("A"));
    expect(after.remainingSeconds).toBe(before.remainingSeconds);
    expect(after.scoreEvents).toEqual([]);
  });
});

describe("zoom movement (no longer an economy)", () => {
  it("crossing a new zoom-out step never costs time", () => {
    const state = run(createRound(CHAD, 10), oneZoomStep());
    expect(state.zoom).toBeCloseTo(1 + ZOOM_STEP, 5);
    expect(state.remainingSeconds).toBe(60);
    expect(latestScoreEvent(state)).toBeNull();
  });

  it("zooming to the world reveal never costs time either", () => {
    const state = run(createRound(CHAD, 3), { type: "ZOOM", deltaY: 1_000_000 });
    expect(state.zoom).toBe(3);
    expect(state.maxZoomReached).toBe(3);
    expect(state.remainingSeconds).toBe(60);
    expect(state.scoreEvents).toEqual([]);
  });

  it("re-crossing already-seen territory behaves exactly like new territory", () => {
    const out = run(createRound(CHAD, 10), oneZoomStep());
    const backIn = run(out, { type: "ZOOM", deltaY: -ZOOM_STEP / ZOOM_SENSITIVITY });
    const outAgain = run(backIn, oneZoomStep());
    expect(outAgain.remainingSeconds).toBe(out.remainingSeconds);
    expect(outAgain.scoreEvents.length).toBe(out.scoreEvents.length);
  });

  it("zoom keeps working after the round ends, free of charge", () => {
    const ended = run(createRound(CHAD, 10), { type: "GIVE_UP" });
    const zoomed = run(ended, oneZoomStep());
    expect(zoomed.zoom).toBeGreaterThan(ended.zoom);
    expect(zoomed.remainingSeconds).toBe(ended.remainingSeconds);
    expect(zoomed.scoreEvents.length).toBe(ended.scoreEvents.length);
  });

  it("time is never mutated by any mix of zoom events", () => {
    const before = run(createRound(CHAD, 10), tick(10)); // 50 remaining
    const after = run(before, oneZoomStep(), oneZoomStep(), { type: "ZOOM", deltaY: -50 }, oneZoomStep());
    expect(after.remainingSeconds).toBe(before.remainingSeconds);
    expect(after.scoreEvents).toEqual([]);
  });
});

describe("selectors", () => {
  it("outline completes at 45% of the round; neighbors complete at 100%", () => {
    const start = createRound(CHAD, 3);
    expect(outlineCompletion(start)).toBe(0);
    expect(neighborCompletion(start)).toBe(0);

    const mid = run(start, tick(60 * 0.45));
    expect(outlineCompletion(mid)).toBeCloseTo(100, 5);
    expect(neighborCompletion(mid)).toBeCloseTo(45, 5);

    const end = run(start, tick(60));
    expect(outlineCompletion(end)).toBe(100);
    expect(neighborCompletion(end)).toBe(100);
  });

  it("keeps the time-driven completions while running (no early snap)", () => {
    const mid = run(createRound(CHAD, 3), tick(6)); // 10% elapsed
    expect(mid.status).toBe("running");
    expect(outlineCompletion(mid)).toBeCloseTo(100 / 4.5, 5); // 10% / 45%
    expect(neighborCompletion(mid)).toBeCloseTo(10, 5);
  });

  it("hints are fully drawn at 0:00 even though the round is still running", () => {
    const zero = run(createRound(CHAD, 3), tick(60));
    expect(zero.status).toBe("running");
    expect(zero.remainingSeconds).toBe(0);
    expect(outlineCompletion(zero)).toBe(100);
    expect(neighborCompletion(zero)).toBe(100);
  });

  it("completes both to 100 on solve, regardless of clock position", () => {
    const solved = run(createRound(PERU, 3), tick(1), guess("P"), guess("E"), guess("R"), guess("U"));
    expect(solved.status).toBe("solved");
    expect(outlineCompletion(solved)).toBe(100);
    expect(neighborCompletion(solved)).toBe(100);
  });

  it("completes both to 100 on give-up, regardless of clock position", () => {
    const failed = run(createRound(CHAD, 3), tick(1), { type: "GIVE_UP" });
    expect(failed.status).toBe("failed");
    expect(failed.remainingSeconds).toBe(59); // clock nowhere near 0
    expect(outlineCompletion(failed)).toBe(100);
    expect(neighborCompletion(failed)).toBe(100);
  });

  it("non-letter characters are always revealed and not letters", () => {
    const state = createRound({ name: "Sri Lanka", unique_letters: 7 }, 3);
    const space = displayChars(state)[3];
    expect(space).toEqual({ char: " ", isLetter: false, revealed: true });
  });
});
