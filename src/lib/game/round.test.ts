import { describe, expect, it } from "vitest";
import {
  createRound,
  reduceRound,
  displayChars,
  outlineCompletion,
  neighborCompletion,
  latestScoreEvent,
  splitIntoWordGroups,
  getPenaltySeconds,
  PENALTY_TIERS,
  ROUND_DURATION_SECONDS,
  CORRECT_STREAK_BONUS_SECONDS,
} from "./round";
import type { RoundEvent, RoundState } from "./round";
import { ZOOM_PENALTY_SECONDS, ZOOM_SENSITIVITY, ZOOM_STEP } from "./zoom";

/** "Chad": 4 unique letters -> harshest tier (-20s). */
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

describe("getPenaltySeconds", () => {
  it("applies the harshest tier at <=5 unique letters", () => {
    expect(getPenaltySeconds(1)).toBe(20);
    expect(getPenaltySeconds(5)).toBe(20);
  });

  it("applies the middle tier at 6-9 unique letters", () => {
    expect(getPenaltySeconds(6)).toBe(15);
    expect(getPenaltySeconds(9)).toBe(15);
  });

  it("applies the lightest tier at 10+ unique letters", () => {
    expect(getPenaltySeconds(10)).toBe(10);
    expect(getPenaltySeconds(26)).toBe(10);
  });

  it("exposes the tiers as a named, inspectable table", () => {
    expect(PENALTY_TIERS.length).toBe(3);
  });
});

describe("clock rules (ported from GameClock)", () => {
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

  it("transitions to failed when the clock reaches 0, clamped at 0", () => {
    const state = run(createRound(CHAD, 3, 5), tick(10));
    expect(state.status).toBe("failed");
    expect(state.remainingSeconds).toBe(0);
  });

  it("ignores further ticks and guesses once failed", () => {
    const state = run(createRound(CHAD, 3, 5), tick(10), tick(5), guess("X"));
    expect(state.status).toBe("failed");
    expect(state.remainingSeconds).toBe(0);
    expect(state.guesses).toEqual({});
  });

  it("give-up transitions to failed immediately regardless of remaining time", () => {
    const state = run(createRound(CHAD, 3), { type: "GIVE_UP" });
    expect(state.status).toBe("failed");
    expect(state.remainingSeconds).toBe(60);
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

  it("subtracts the tier penalty on a wrong guess and logs a score event", () => {
    const state = run(createRound(CHAD, 3), guess("Z"));
    expect(state.guesses).toEqual({ Z: "wrong" });
    expect(state.remainingSeconds).toBe(60 - 20);
    expect(latestScoreEvent(state)).toMatchObject({ secondsDelta: -20 });
  });

  it("a wrong guess that drains the clock fails the round", () => {
    const state = run(createRound(CHAD, 3, 15), guess("Z"));
    expect(state.status).toBe("failed");
    expect(state.remainingSeconds).toBe(0);
  });

  it("grants the streak bonus every 2nd consecutive correct guess, clamped at the starting duration", () => {
    let state = run(createRound(PERU, 3), tick(1)); // 59 remaining
    state = run(state, guess("P")); // streak 1, no bonus
    expect(latestScoreEvent(state)).toBeNull();
    state = run(state, guess("E")); // streak 2 -> +2, clamped to 60
    expect(state.remainingSeconds).toBe(60);
    expect(latestScoreEvent(state)).toMatchObject({ secondsDelta: CORRECT_STREAK_BONUS_SECONDS });
  });

  it("a wrong guess resets the correct streak", () => {
    let state = run(createRound(PERU, 3), guess("P"), guess("Z")); // streak back to 0
    state = run(state, guess("E")); // streak 1 again -> no bonus
    const events = state.scoreEvents.map((e) => e.secondsDelta);
    expect(events).toEqual([-20]); // only the wrong-guess penalty
  });

  it("solves the round when every unique letter is correct", () => {
    const state = run(createRound(PERU, 3), guess("P"), guess("E"), guess("R"), guess("U"));
    expect(state.status).toBe("solved");
    expect(displayChars(state).every((c) => c.revealed)).toBe(true);
  });

  it("score-event ids are monotonic even for identical deltas", () => {
    const state = run(createRound(CHAD, 3), guess("Z"), guess("X"));
    const [a, b] = state.scoreEvents;
    expect(a.secondsDelta).toBe(b.secondsDelta);
    expect(b.id).toBeGreaterThan(a.id);
  });
});

describe("zoom economy", () => {
  it("charges a flat penalty per new zoom-out step crossed", () => {
    const state = run(createRound(CHAD, 10), oneZoomStep());
    expect(state.zoom).toBeCloseTo(1 + ZOOM_STEP, 5);
    expect(state.remainingSeconds).toBe(60 - ZOOM_PENALTY_SECONDS);
    expect(latestScoreEvent(state)).toMatchObject({ secondsDelta: -ZOOM_PENALTY_SECONDS });
  });

  it("never re-charges already-seen territory", () => {
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

  it("completes both to 100 when a wrong-guess penalty drains the clock", () => {
    const failed = run(createRound(CHAD, 3, 15), guess("Z")); // -20s tier kills a 15s clock
    expect(failed.status).toBe("failed");
    expect(outlineCompletion(failed)).toBe(100);
    expect(neighborCompletion(failed)).toBe(100);
  });

  it("non-letter characters are always revealed and not letters", () => {
    const state = createRound({ name: "Sri Lanka", unique_letters: 7 }, 3);
    const space = displayChars(state)[3];
    expect(space).toEqual({ char: " ", isLetter: false, revealed: true });
  });
});

describe("splitIntoWordGroups", () => {
  it("keeps a single-word name as one group", () => {
    const state = createRound(CHAD, 4);
    const groups = splitIntoWordGroups(displayChars(state));
    expect(groups).toHaveLength(1);
    expect(groups[0].map((c) => c.char).join("")).toBe("CHAD");
  });

  it("splits a multi-word name at spaces without emitting a cell for the space itself", () => {
    const state = createRound({ name: "Costa Rica", unique_letters: 7 }, 4);
    const groups = splitIntoWordGroups(displayChars(state));
    expect(groups.map((g) => g.map((c) => c.char).join(""))).toEqual(["COSTA", "RICA"]);
    expect(groups.flat().every((c) => c.char !== " ")).toBe(true);
  });
});
