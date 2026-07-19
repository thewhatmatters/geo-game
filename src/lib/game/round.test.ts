import { describe, expect, it } from "vitest";
import {
  createRound,
  reduceRound,
  displayChars,
  outlineCompletion,
  neighborCompletion,
  latestScoreEvent,
  currentMultiplier,
  inLockout,
  isSolveStatus,
  ROUND_DURATION_SECONDS,
  LOCKOUT_ATTEMPT_BUDGET,
} from "./round";
import type { RoundEvent, RoundState } from "./round";
import { roundScore, timeBonus, TIME_BONUS_PER_SECOND } from "./score";
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

  it("guessing still works after the clock reaches 0 (the round continues in lockout)", () => {
    const state = run(createRound(PERU, 3), tick(60), guess("P"));
    expect(state.status).toBe("running");
    expect(state.guesses).toEqual({ P: "correct" });
    expect(state.remainingSeconds).toBe(0);
  });

  it("give-up transitions to gave_up immediately regardless of remaining time", () => {
    const state = run(createRound(CHAD, 3), { type: "GIVE_UP" });
    expect(state.status).toBe("gave_up");
    expect(state.remainingSeconds).toBe(60);
  });

  it("ignores further ticks and guesses once given up", () => {
    const state = run(createRound(CHAD, 3), { type: "GIVE_UP" }, tick(5), guess("X"));
    expect(state.status).toBe("gave_up");
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
  });
});

describe("score economy (event-sourced, never a function of the clock)", () => {
  /** 5 unique letters -> the -200 tier. */
  const CHINA = { name: "China", unique_letters: 5 };
  /** 6 unique letters -> the -150 tier. */
  const BRAZIL = { name: "Brazil", unique_letters: 6 };
  /** 10 unique letters -> the -100 tier. */
  const SWITZERLAND = { name: "Switzerland", unique_letters: 10 };

  it("starts at zero with an empty event log", () => {
    const start = createRound(PERU, 3);
    expect(start.score).toBe(0);
    expect(start.scoreEvents).toEqual([]);
    expect(latestScoreEvent(start)).toBeNull();
  });

  it("builds the combo: consecutive correct letters pay x1, x1.5, then x2", () => {
    const one = run(createRound(PERU, 3), guess("P"));
    expect(one.score).toBe(100);
    expect(latestScoreEvent(one)).toMatchObject({ type: "correct", delta: 100, multiplier: 1 });

    const two = run(one, guess("E"));
    expect(two.score).toBe(250);
    expect(latestScoreEvent(two)).toMatchObject({ type: "correct", delta: 150, multiplier: 1.5 });

    const three = run(two, guess("R"));
    expect(three.score).toBe(450);
    expect(latestScoreEvent(three)).toMatchObject({ type: "correct", delta: 200, multiplier: 2 });
  });

  it("caps the combo at x2 no matter how long the streak runs", () => {
    const state = run(createRound(SWITZERLAND, 3), guess("S"), guess("W"), guess("I"), guess("T"), guess("Z"));
    expect(latestScoreEvent(state)).toMatchObject({ delta: 200, multiplier: 2 });
    expect(currentMultiplier(state)).toBe(2);
    expect(state.score).toBe(100 + 150 + 200 + 200 + 200);
  });

  it("resets the combo to x1 on a wrong letter, and rebuilds from there", () => {
    const built = run(createRound(SWITZERLAND, 3), guess("S"), guess("W"), guess("I")); // 100+150+200 = 450
    expect(built.score).toBe(450);

    const broken = run(built, guess("Q")); // 10 unique -> -100
    expect(broken.correctStreak).toBe(0);
    expect(currentMultiplier(broken)).toBe(1);
    expect(latestScoreEvent(broken)).toMatchObject({ type: "wrong", delta: -100, multiplier: 1 });
    expect(broken.score).toBe(350);

    const rebuilt = run(broken, guess("T"));
    expect(latestScoreEvent(rebuilt)).toMatchObject({ delta: 100, multiplier: 1 });
    expect(rebuilt.score).toBe(450);
  });

  it("deducts -200 for a wrong letter on a <=5 unique-letter target", () => {
    const state = run(createRound(CHINA, 3), guess("C"), guess("Q")); // +100, -200 -> floors at 0
    expect(latestScoreEvent(state)).toMatchObject({ type: "wrong", delta: -200 });
  });

  it("deducts -150 for a wrong letter on a 6-9 unique-letter target", () => {
    const state = run(createRound(BRAZIL, 3), guess("Q"));
    expect(latestScoreEvent(state)).toMatchObject({ type: "wrong", delta: -150 });
    expect(state.score).toBe(0);
  });

  it("deducts -100 for a wrong letter on a 10+ unique-letter target", () => {
    const state = run(createRound(SWITZERLAND, 3), guess("Q"));
    expect(latestScoreEvent(state)).toMatchObject({ type: "wrong", delta: -100 });
  });

  it("floors the running score at 0 — the event still reports its full nominal delta", () => {
    const state = run(createRound(CHAD, 3), guess("C"), guess("Q")); // +100, then -200
    expect(state.score).toBe(0);
    expect(latestScoreEvent(state)).toMatchObject({ delta: -200 });

    const deeper = run(state, guess("X"), guess("Y"));
    expect(deeper.score).toBe(0);
  });

  it("emits exactly one event per scoring guess, with monotonic ids", () => {
    const state = run(createRound(PERU, 3), guess("P"), guess("Q"), guess("E"), guess("Q"), guess("3"));
    expect(state.scoreEvents.map((e) => e.id)).toEqual([1, 2, 3]);
  });

  it("never emits an event for a tick — the clock earns nothing", () => {
    const state = run(createRound(PERU, 3), tick(10), tick(20));
    expect(state.scoreEvents).toEqual([]);
    expect(state.score).toBe(0);
  });

  it("keeps the earned score frozen once the round is solved", () => {
    const solved = run(createRound(PERU, 3), guess("P"), guess("E"), guess("R"), guess("U"));
    expect(solved.status).toBe("solved");
    expect(solved.score).toBe(100 + 150 + 200 + 200);
    expect(run(solved, guess("Z"), tick(10)).score).toBe(solved.score);
  });
});

describe("lockout mode (the soft zero)", () => {
  /** Runs the clock out so the round is in lockout with a full budget. */
  const atZero = (target = PERU) => run(createRound(target, 3), tick(60));

  it("0:00 flips the round into lockout without ending it, budget untouched", () => {
    const zero = atZero();
    expect(zero.status).toBe("running");
    expect(inLockout(zero)).toBe(true);
    expect(zero.lockoutAttemptsRemaining).toBe(LOCKOUT_ATTEMPT_BUDGET);
  });

  it("wrong guesses before 0:00 never touch the budget", () => {
    const state = run(createRound(PERU, 3), guess("Z"), guess("Q"), guess("X"));
    expect(inLockout(state)).toBe(false);
    expect(state.lockoutAttemptsRemaining).toBe(LOCKOUT_ATTEMPT_BUDGET);
    expect(state.status).toBe("running");
  });

  it("each wrong letter in lockout burns exactly one attempt", () => {
    let state = atZero();
    for (let spent = 1; spent < LOCKOUT_ATTEMPT_BUDGET; spent += 1) {
      state = run(state, guess(String.fromCharCode(70 + spent))); // G, H, I, ... — none in "Peru"
      expect(state.lockoutAttemptsRemaining).toBe(LOCKOUT_ATTEMPT_BUDGET - spent);
      expect(state.status).toBe("running");
    }
  });

  it("correct letters in lockout cost nothing from the budget", () => {
    const state = run(atZero(), guess("P"), guess("E"));
    expect(state.lockoutAttemptsRemaining).toBe(LOCKOUT_ATTEMPT_BUDGET);
    expect(state.status).toBe("running");
  });

  it("locks out on the wrong guess that exhausts the budget", () => {
    const wrong = ["G", "H", "I", "J", "K"].map(guess);
    expect(wrong.length).toBe(LOCKOUT_ATTEMPT_BUDGET);
    const state = run(atZero(), ...wrong);
    expect(state.status).toBe("locked_out");
    expect(state.lockoutAttemptsRemaining).toBe(0);
    expect(inLockout(state)).toBe(false); // the round is over, not paused at 0
  });

  it("ignores further guesses once locked out", () => {
    const out = run(atZero(), guess("G"), guess("H"), guess("I"), guess("J"), guess("K"));
    expect(run(out, guess("P"), tick(1))).toBe(out);
  });

  it("give-up in lockout still produces gave_up, not locked_out", () => {
    const state = run(atZero(), guess("G"), { type: "GIVE_UP" });
    expect(state.status).toBe("gave_up");
    expect(state.lockoutAttemptsRemaining).toBe(LOCKOUT_ATTEMPT_BUDGET - 1);
  });

  it("solving in lockout is a solve — solved_late, on whatever budget is left", () => {
    const state = run(atZero(), guess("G"), guess("P"), guess("E"), guess("R"), guess("U"));
    expect(state.status).toBe("solved_late");
    expect(isSolveStatus(state.status)).toBe(true);
    expect(state.lockoutAttemptsRemaining).toBe(LOCKOUT_ATTEMPT_BUDGET - 1);
  });

  it("solving with the clock still running is a clean solve", () => {
    const state = run(createRound(PERU, 3), tick(59), guess("P"), guess("E"), guess("R"), guess("U"));
    expect(state.status).toBe("solved");
    expect(isSolveStatus(state.status)).toBe(true);
  });
});

describe("outcome scoring (time bonus, failure zeroing)", () => {
  const solveEarly = (elapsed: number) =>
    run(createRound(PERU, 3), tick(elapsed), guess("P"), guess("E"), guess("R"), guess("U"));

  /** Peru solved with no wrong guesses: 100 + 150 + 200 + 200. */
  const EARNED = 650;

  it("adds remainingSeconds x 10 on a clean solve", () => {
    const state = solveEarly(23); // 37 seconds left
    expect(state.remainingSeconds).toBe(37);
    expect(timeBonus(state.status, state.remainingSeconds)).toBe(37 * TIME_BONUS_PER_SECOND);
    expect(roundScore(state)).toBe(EARNED + 370);
  });

  it("pays whole seconds only — a fractional clock never rounds up the bonus", () => {
    const state = solveEarly(23.4); // 36.6 left
    expect(roundScore(state)).toBe(EARNED + 36 * TIME_BONUS_PER_SECOND);
  });

  it("gives a late solve its earned points but no time bonus", () => {
    const state = run(createRound(PERU, 3), tick(60), guess("P"), guess("E"), guess("R"), guess("U"));
    expect(state.status).toBe("solved_late");
    expect(timeBonus(state.status, state.remainingSeconds)).toBe(0);
    expect(roundScore(state)).toBe(EARNED);
  });

  it("zeroes a locked-out round even though letters were earned", () => {
    const state = run(atZeroWith(PERU), guess("P"), guess("G"), guess("H"), guess("I"), guess("J"), guess("K"));
    expect(state.status).toBe("locked_out");
    expect(state.score).toBeGreaterThanOrEqual(0);
    expect(roundScore(state)).toBe(0);
  });

  it("zeroes a given-up round, in either phase", () => {
    const early = run(createRound(PERU, 3), tick(10), guess("P"), guess("E"), { type: "GIVE_UP" });
    expect(roundScore(early)).toBe(0);

    const late = run(atZeroWith(PERU), guess("P"), { type: "GIVE_UP" });
    expect(late.status).toBe("gave_up");
    expect(roundScore(late)).toBe(0);
  });

  it("awards no time bonus while the round is still running", () => {
    const running = run(createRound(PERU, 3), tick(10), guess("P"));
    expect(roundScore(running)).toBe(100);
  });
});

/** Clock run out, full lockout budget. */
function atZeroWith(target: { name: string; unique_letters: number }): RoundState {
  return run(createRound(target, 3), tick(60));
}

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
    expect(failed.status).toBe("gave_up");
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
