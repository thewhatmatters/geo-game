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

/** "Chad": 4 unique letters. */
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

describe("clock rules (pure pacer)", () => {
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

  it("clamps at 0 without failing the round (soft zero until US-003)", () => {
    const state = run(createRound(CHAD, 3, 5), tick(10));
    expect(state.status).toBe("running");
    expect(state.remainingSeconds).toBe(0);
  });

  it("keeps accepting ticks and guesses after the clock hits 0", () => {
    const atZero = run(createRound(CHAD, 3, 5), tick(10));
    expect(atZero.remainingSeconds).toBe(0);
    expect(atZero.status).toBe("running");

    const stillZero = run(atZero, tick(5));
    expect(stillZero.remainingSeconds).toBe(0);
    expect(stillZero.status).toBe("running");

    const afterGuess = run(atZero, guess("X"));
    expect(afterGuess.status).toBe("running");
    expect(afterGuess.remainingSeconds).toBe(0);
    expect(afterGuess.guesses).toEqual({ X: "wrong" });
  });

  it("give-up transitions to failed immediately regardless of remaining time", () => {
    const state = run(createRound(CHAD, 3), { type: "GIVE_UP" });
    expect(state.status).toBe("failed");
    expect(state.remainingSeconds).toBe(60);
  });

  it("ignores further ticks and guesses once given up", () => {
    const state = run(createRound(CHAD, 3), { type: "GIVE_UP" }, tick(5), guess("X"));
    expect(state.status).toBe("failed");
    expect(state.remainingSeconds).toBe(60);
    expect(state.guesses).toEqual({});
  });
});

describe("guessing (no time mutations)", () => {
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

  it("wrong guess records the letter and does not change remainingSeconds", () => {
    const start = run(createRound(CHAD, 3), tick(3));
    const state = run(start, guess("Z"));
    expect(state.guesses).toEqual({ Z: "wrong" });
    expect(state.remainingSeconds).toBe(start.remainingSeconds);
    expect(latestScoreEvent(state)).toBeNull();
  });

  it("wrong guess never fails the round via the clock", () => {
    const state = run(createRound(CHAD, 3, 15), guess("Z"));
    expect(state.status).toBe("running");
    expect(state.remainingSeconds).toBe(15);
  });

  it("correct streak no longer grants time (clock is a pure pacer)", () => {
    let state = run(createRound(PERU, 3), tick(1)); // 59 remaining
    state = run(state, guess("P")); // streak 1
    expect(state.remainingSeconds).toBe(59);
    expect(state.correctStreak).toBe(1);
    state = run(state, guess("E")); // streak 2 — no +2s bonus
    expect(state.remainingSeconds).toBe(59);
    expect(state.correctStreak).toBe(2);
    expect(latestScoreEvent(state)).toBeNull();
  });

  it("a wrong guess resets the correct streak without mutating time", () => {
    let state = run(createRound(PERU, 3), tick(2), guess("P"), guess("Z"));
    expect(state.correctStreak).toBe(0);
    expect(state.remainingSeconds).toBe(58);
    state = run(state, guess("E")); // streak 1 again
    expect(state.correctStreak).toBe(1);
    expect(state.remainingSeconds).toBe(58);
    expect(state.scoreEvents).toEqual([]);
  });

  it("solves the round when every unique letter is correct", () => {
    const state = run(createRound(PERU, 3), guess("P"), guess("E"), guess("R"), guess("U"));
    expect(state.status).toBe("solved");
    expect(displayChars(state).every((c) => c.revealed)).toBe(true);
  });

  it("guess events never emit time-based score events", () => {
    const state = run(createRound(CHAD, 3), guess("Z"), guess("X"), guess("C"));
    expect(state.scoreEvents).toEqual([]);
    expect(latestScoreEvent(state)).toBeNull();
  });
});

describe("zoom (no time cost)", () => {
  it("updates zoom without changing remainingSeconds", () => {
    const state = run(createRound(CHAD, 10), oneZoomStep());
    expect(state.zoom).toBeCloseTo(1 + ZOOM_STEP, 5);
    expect(state.remainingSeconds).toBe(60);
    expect(state.scoreEvents).toEqual([]);
  });

  it("tracks maxZoomReached pay-once without charging time on re-cross", () => {
    const out = run(createRound(CHAD, 10), oneZoomStep());
    const remainingAfterFirst = out.remainingSeconds;
    const backIn = run(out, { type: "ZOOM", deltaY: -ZOOM_STEP / ZOOM_SENSITIVITY });
    const outAgain = run(backIn, oneZoomStep());
    expect(outAgain.remainingSeconds).toBe(remainingAfterFirst);
    expect(outAgain.maxZoomReached).toBe(out.maxZoomReached);
    expect(outAgain.scoreEvents).toEqual([]);
  });

  it("zoom keeps working after the round ends, free of charge", () => {
    const ended = run(createRound(CHAD, 10), { type: "GIVE_UP" });
    const zoomed = run(ended, oneZoomStep());
    expect(zoomed.zoom).toBeGreaterThan(ended.zoom);
    expect(zoomed.remainingSeconds).toBe(ended.remainingSeconds);
    expect(zoomed.scoreEvents.length).toBe(ended.scoreEvents.length);
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
    expect(end.status).toBe("running"); // soft zero — not failed
    expect(outlineCompletion(end)).toBe(100);
    expect(neighborCompletion(end)).toBe(100);
  });

  it("keeps the time-driven completions while running (no early snap)", () => {
    const mid = run(createRound(CHAD, 3), tick(6)); // 10% elapsed
    expect(mid.status).toBe("running");
    expect(outlineCompletion(mid)).toBeCloseTo(100 / 4.5, 5); // 10% / 45%
    expect(neighborCompletion(mid)).toBeCloseTo(10, 5);
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

  it("completes both to 100 when the pacer hits 0 while still running", () => {
    const atZero = run(createRound(CHAD, 3), tick(60));
    expect(atZero.status).toBe("running");
    expect(atZero.remainingSeconds).toBe(0);
    expect(outlineCompletion(atZero)).toBe(100);
    expect(neighborCompletion(atZero)).toBe(100);
  });

  it("non-letter characters are always revealed and not letters", () => {
    const state = createRound({ name: "Sri Lanka", unique_letters: 7 }, 3);
    const space = displayChars(state)[3];
    expect(space).toEqual({ char: " ", isLetter: false, revealed: true });
  });
});
