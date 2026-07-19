import type { Country } from "./dailyCountry";
import { applyZoomDelta, ZOOM_MIN } from "./zoom";

/**
 * RoundCore — the round's entire rulebook as one pure state machine.
 * Everything that used to be split between the GameClock class and
 * useGameRound's glue (tick decay, guess validation, solve detection, zoom
 * position, score events) is a plain function of (state, event) here,
 * testable with no timers, no subscriptions, no React. useGameRound is a
 * thin adapter that feeds this reducer TICK events from a real interval.
 *
 * The clock is a PURE PACER (US-001): it counts 60 -> 0 at 1s/tick and
 * nothing a player does — a wrong guess, a correct streak, a zoom-out —
 * ever adds or steals time. Those rules moved off the clock and become
 * score events in US-002 / US-004. Reaching 0:00 no longer fails the round;
 * it simply continues with the hints fully drawn (the soft-zero lockout
 * lands in US-003).
 */

export const ROUND_DURATION_SECONDS = 60;

/**
 * Fraction of the clock the target outline takes to fully draw. Neighbor
 * outlines draw simultaneously with the target from t=0, finishing at 100%
 * exactly as the clock hits 0 — see the selectors below.
 */
export const HINT_ONSET_FRACTION = 0.45;

export type RoundStatus = "running" | "solved" | "failed";

export type LetterState = "correct" | "wrong";

export interface DisplayChar {
  char: string;
  /** True once a correctly-guessed letter is locked in, or immediately for non-letter characters (spaces, hyphens) — those are never hidden. */
  revealed: boolean;
  /** False for spaces/hyphens/etc — rendered as a plain gap between boxed cells rather than a cell of its own. */
  isLetter: boolean;
}

/**
 * One discrete score event for the UI to surface as a transient popup next
 * to the score. Dormant under US-001 (the clock is a pure pacer, so nothing
 * emits one yet) — US-002 reintroduces emission with proper point deltas and
 * combo context. Kept here so the public surface (useGameRound.scoreEvent,
 * App's popup wiring) stays stable across the economy migration.
 */
export interface ScoreEvent {
  id: number;
  secondsDelta: number;
}

export interface RoundState {
  status: RoundStatus;
  remainingSeconds: number;
  /** Retained for the hint-completion selectors and future scoring; the clock never exceeds it. */
  readonly initialSeconds: number;
  readonly targetName: string;
  readonly uniqueLetterCount: number;
  guesses: Record<string, LetterState>;
  /** Consecutive correct guesses, reset by any wrong guess. No longer grants time (US-001); feeds the combo multiplier in US-002. */
  correctStreak: number;
  zoom: number;
  /** Furthest zoom-out reached this round — surfaced so US-004 can charge newly-crossed territory once (see lib/game/zoom.ts). */
  maxZoomReached: number;
  readonly zoomMax: number;
  /** Newest-last — dormant under US-001 (see ScoreEvent), repopulated in US-002. */
  scoreEvents: ScoreEvent[];
}

export type RoundEvent =
  | { type: "TICK"; deltaSeconds: number }
  | { type: "GUESS"; letter: string }
  | { type: "ZOOM"; deltaY: number }
  | { type: "GIVE_UP" };

function uniqueLettersOf(name: string): Set<string> {
  return new Set(name.toUpperCase().replace(/[^A-Z]/g, "").split(""));
}

export function createRound(
  target: Pick<Country, "name" | "unique_letters">,
  zoomMax: number,
  durationSeconds: number = ROUND_DURATION_SECONDS,
): RoundState {
  return {
    status: "running",
    remainingSeconds: durationSeconds,
    initialSeconds: durationSeconds,
    targetName: target.name,
    uniqueLetterCount: target.unique_letters,
    guesses: {},
    correctStreak: 0,
    zoom: ZOOM_MIN,
    maxZoomReached: ZOOM_MIN,
    zoomMax,
    scoreEvents: [],
  };
}

/**
 * Pure pacer: the clock only ever counts down, clamped at 0. Reaching 0 does
 * NOT fail the round (US-001) — status stays "running" and the hints sit
 * fully drawn until US-003 adds the soft-zero lockout.
 */
function tickDown(state: RoundState, seconds: number): RoundState {
  const remainingSeconds = Math.max(0, state.remainingSeconds - seconds);
  if (remainingSeconds === state.remainingSeconds) return state;
  return { ...state, remainingSeconds };
}

function reduceGuess(state: RoundState, rawLetter: string): RoundState {
  const letter = rawLetter.toUpperCase();
  if (!/^[A-Z]$/.test(letter) || state.guesses[letter]) return state;

  const required = uniqueLettersOf(state.targetName);

  if (required.has(letter)) {
    const guesses = { ...state.guesses, [letter]: "correct" as const };
    const correctStreak = state.correctStreak + 1;
    const solved = [...required].every((l) => guesses[l] === "correct");
    return { ...state, guesses, correctStreak, status: solved ? "solved" : state.status };
  }

  // Wrong guess: record it and reset the correct streak. No time penalty —
  // the clock is a pure pacer; the point cost lands as a score event in US-002.
  const guesses = { ...state.guesses, [letter]: "wrong" as const };
  return { ...state, guesses, correctStreak: 0 };
}

function reduceZoom(state: RoundState, deltaY: number): RoundState {
  // Zoom moves the view and tracks its high-water mark only — it never
  // touches the clock (US-001). US-004 turns newly-crossed territory into a
  // score cost off maxZoomReached. Stays available after the round ends.
  const result = applyZoomDelta(state.zoom, deltaY, state.maxZoomReached, state.zoomMax);
  return { ...state, zoom: result.zoom, maxZoomReached: result.maxZoomReached };
}

export function reduceRound(state: RoundState, event: RoundEvent): RoundState {
  // ZOOM stays live after the round ends (free exploration of the revealed
  // map); everything else is a no-op once the round has been won or given up.
  if (event.type === "ZOOM") return reduceZoom(state, event.deltaY);
  if (state.status !== "running") return state;

  switch (event.type) {
    case "TICK":
      return tickDown(state, event.deltaSeconds);
    case "GUESS":
      return reduceGuess(state, event.letter);
    case "GIVE_UP":
      return { ...state, status: "failed" };
  }
}

// ── Selectors — pure derivations off RoundState, not stored state ──────────

export function displayChars(state: RoundState): DisplayChar[] {
  return state.targetName
    .toUpperCase()
    .split("")
    .map((char) => {
      const isLetter = /[A-Z]/.test(char);
      return { char, isLetter, revealed: isLetter ? state.guesses[char] === "correct" : true };
    });
}

/**
 * 0–100: the target outline finishes drawing at HINT_ONSET_FRACTION of the
 * round — it's the primary hint. A terminal status (solved, give-up)
 * completes it, and so does the clock running out (elapsed reaches
 * initialSeconds): on a timed-out round the finished shape is the player's
 * geographic payoff.
 */
export function outlineCompletion(state: RoundState): number {
  if (state.status !== "running") return 100;
  const elapsed = state.initialSeconds - state.remainingSeconds;
  return Math.min(100, (elapsed / (state.initialSeconds * HINT_ONSET_FRACTION)) * 100);
}

/**
 * 0–100: neighbor outlines draw from t=0 and finish exactly as the clock
 * hits 0. Like outlineCompletion, any terminal status completes them, and so
 * does the clock reaching 0 — post-round the full hint set is fair game.
 */
export function neighborCompletion(state: RoundState): number {
  if (state.status !== "running") return 100;
  const elapsed = state.initialSeconds - state.remainingSeconds;
  return Math.min(100, (elapsed / state.initialSeconds) * 100);
}

export function latestScoreEvent(state: RoundState): ScoreEvent | null {
  return state.scoreEvents.length ? state.scoreEvents[state.scoreEvents.length - 1] : null;
}
