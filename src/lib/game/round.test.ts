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

describe("clock is a pure pacer (US-001)", () => {
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

  it("reaching 0:00 clamps at 0 but does NOT fail the round (stays running)", () => {
    const state = run(createRound(CHAD, 3, 5), tick(10));
    expect(state.remainingSeconds).toBe(0);
    expect(state.status).toBe("running");
  });

  it("keeps accepting guesses at 0:00 (soft-zero lockout arrives in US-003)", () => {
    const state = run(createRound(CHAD, 3, 5), tick(10), guess("C"));
    expect(state.remainingSeconds).toBe(0);
    expect(state.status).toBe("running");
    expect(state.guesses).toEqual({ C: "correct" });
  });

  it("give-up transitions to failed immediately regardless of remaining time", () => {
    const state = run(createRound(CHAD, 3), { type: "GIVE_UP" });
    expect(state.status).toBe("failed");
    expect(state.remainingSeconds).toBe(60);
  });

  it("ignores further events once failed", () => {
    const state = run(createRound(CHAD, 3), { type: "GIVE_UP" }, tick(5), guess("X"));
    expect(state.status).toBe("failed");
    expect(state.remainingSeconds).toBe(60);
    expect(state.guesses).toEqual({});
  });
});

describe("no player action mutates the clock (US-001)", () => {
  it("a wrong guess costs no time and emits no score event", () => {
    const before = run(createRound(CHAD, 3), tick(1)); // 59 remaining
    const after = run(before, guess("Z"));
    expect(after.guesses).toEqual({ Z: "wrong" });
    expect(after.remainingSeconds).toBe(before.remainingSeconds);
    expect(latestScoreEvent(after)).toBeNull();
  });

  it("a run of correct guesses grants no bonus time and emits no score event", () => {
    let state = run(createRound(PERU, 3), tick(1)); // 59 remaining
    state = run(state, guess("P"), guess("E"), guess("R")); // build a correct streak
    expect(state.correctStreak).toBe(3);
    expect(state.remainingSeconds).toBe(59);
    expect(latestScoreEvent(state)).toBeNull();
  });

  it("zooming out costs no time and emits no score event", () => {
    const before = run(createRound(CHAD, 10), tick(1)); // 59 remaining
    const after = run(before, oneZoomStep());
    expect(after.zoom).toBeCloseTo(1 + ZOOM_STEP, 5);
    expect(after.remainingSeconds).toBe(before.remainingSeconds);
    expect(latestScoreEvent(after)).toBeNull();
  });

  it("no sequence of guesses and zooms ever changes the clock from its tick-only value", () => {
    let state = run(createRound(CHAD, 10), tick(10)); // 50 remaining
    state = run(state, guess("Z"), guess("X"), oneZoomStep(), guess("C"), oneZoomStep());
    expect(state.remainingSeconds).toBe(50);
  });
});

describe("guessing", () => {
  it("locks a correct letter into guesses and reveals every instance", () => {
    const state = run(createRound(CHAD, 3), guess("a"));
    expect(state.guesses).toEqual({ A: "correct" });
    const chars = displayChars(state);
    expect(chars.map((c) => (c.revealed ? c.char : "_")).join("")).toBe("__A_");
  });

  it("ignores non-letters and repeat guesses", () => {
    const first = run(createRound(CHAD, 3), guess("a"));
    expect(run(first, guess("a"))).toBe(first);
    expect(run(first, guess("3"))).toBe(first);
    expect(run(first, guess(" "))).toBe(first);
  });

  it("a wrong guess resets the correct streak", () => {
    const state = run(createRound(PERU, 3), guess("P"), guess("E")); // streak 2
    expect(state.correctStreak).toBe(2);
    const reset = run(state, guess("Z")); // wrong -> streak 0
    expect(reset.correctStreak).toBe(0);
  });

  it("solves the round when every unique letter is correct", () => {
    const state = run(createRound(PERU, 3), guess("P"), guess("E"), guess("R"), guess("U"));
    expect(state.status).toBe("solved");
    expect(displayChars(state).every((c) => c.revealed)).toBe(true);
  });
});

describe("zoom position", () => {
  it("tracks the high-water mark and never re-charges (economy is timeless now)", () => {
    const out = run(createRound(CHAD, 10), oneZoomStep());
    const backIn = run(out, { type: "ZOOM", deltaY: -ZOOM_STEP / ZOOM_SENSITIVITY });
    expect(backIn.zoom).toBeLessThan(out.zoom);
    expect(backIn.maxZoomReached).toBe(out.maxZoomReached);
    expect(backIn.remainingSeconds).toBe(out.remainingSeconds);
  });

  it("zoom keeps working after the round ends, free of charge", () => {
    const ended = run(createRound(CHAD, 10), { type: "GIVE_UP" });
    const zoomed = run(ended, oneZoomStep());
    expect(zoomed.zoom).toBeGreaterThan(ended.zoom);
    expect(zoomed.remainingSeconds).toBe(ended.remainingSeconds);
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

  it("hints are fully drawn once the clock hits 0, even though the round is still running", () => {
    const end = run(createRound(CHAD, 3, 30), tick(30));
    expect(end.status).toBe("running");
    expect(end.remainingSeconds).toBe(0);
    expect(outlineCompletion(end)).toBe(100);
    expect(neighborCompletion(end)).toBe(100);
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
