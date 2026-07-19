import type { Country } from "./dailyCountry";
import { applyZoomDelta, ZOOM_MIN } from "./zoom";

/**
 * RoundCore — the round's entire rulebook as one pure state machine.
 * Everything that used to be split between the GameClock class and
 * useGameRound's glue (tick decay, clamps, guess validation, solve
 * detection, zoom movement, score events) is a plain function of
 * (state, event) here, testable with no timers, no subscriptions, no
 * React. useGameRound is a thin adapter that feeds this reducer TICK
 * events from a real interval.
 *
 * The clock is a pure pacer: it counts down at 1s/tick and NOTHING the
 * player does — wrong guesses, correct streaks, zooming out — mutates
 * remainingSeconds. Reaching 0:00 does not end the round (transitional
 * behavior until the lockout mode lands): the round simply continues
 * with the clock parked at 0 and all hints fully drawn.
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
 * One discrete score event for the UI to surface as a transient "+200"/
 * "-150" popup next to the score — deliberately NOT emitted for ordinary
 * per-tick decay. `id` is a monotonic counter so the UI can key a fresh
 * animation off it even if the same delta repeats back to back. Nothing
 * emits these yet (the old time-economy events are gone with the pure
 * pacer); the event-sourced score economy re-populates this log.
 */
export interface ScoreEvent {
  id: number;
  secondsDelta: number;
}

export interface RoundState {
  status: RoundStatus;
  /** Counts down from initialSeconds to 0 via TICKs only — never mutated by guess or zoom events. */
  remainingSeconds: number;
  readonly initialSeconds: number;
  readonly targetName: string;
  readonly uniqueLetterCount: number;
  guesses: Record<string, LetterState>;
  /** Consecutive correct guesses, reset by any wrong guess — the raw material the combo multiplier is derived from. */
  correctStreak: number;
  zoom: number;
  /** Furthest zoom-out reached this round — lets consumers distinguish new territory from re-crossed territory (see lib/game/zoom.ts). */
  maxZoomReached: number;
  readonly zoomMax: number;
  /** Newest-last — see latestScoreEvent. Always empty under the pure pacer; the score economy re-populates it. */
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

/** Pure tick decay: clamps at 0 and keeps the round running — 0:00 is not a failure, just the end of the paced phase. */
function tickClock(state: RoundState, seconds: number): RoundState {
  if (state.remainingSeconds <= 0) return state;
  return { ...state, remainingSeconds: Math.max(0, state.remainingSeconds - seconds) };
}

function reduceGuess(state: RoundState, rawLetter: string): RoundState {
  const letter = rawLetter.toUpperCase();
  if (!/^[A-Z]$/.test(letter) || state.guesses[letter]) return state;

  const required = uniqueLettersOf(state.targetName);

  if (required.has(letter)) {
    const guesses = { ...state.guesses, [letter]: "correct" as const };
    let next: RoundState = { ...state, guesses, correctStreak: state.correctStreak + 1 };
    const solved = [...required].every((l) => guesses[l] === "correct");
    if (solved) next = { ...next, status: "solved" };
    return next;
  }

  const guesses = { ...state.guesses, [letter]: "wrong" as const };
  return { ...state, guesses, correctStreak: 0 };
}

function reduceZoom(state: RoundState, deltaY: number): RoundState {
  const result = applyZoomDelta(state.zoom, deltaY, state.maxZoomReached, state.zoomMax);
  return { ...state, zoom: result.zoom, maxZoomReached: result.maxZoomReached };
}

export function reduceRound(state: RoundState, event: RoundEvent): RoundState {
  // ZOOM is the one event that stays live after the round ends (free
  // exploration of the revealed map); everything else is a no-op once the
  // round is over.
  if (event.type === "ZOOM") return reduceZoom(state, event.deltaY);
  if (state.status !== "running") return state;

  switch (event.type) {
    case "TICK":
      return tickClock(state, event.deltaSeconds);
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
 * round — it's the primary hint. Any terminal status (solved, give-up)
 * completes it: on failure the name stays hidden, so the finished shape is
 * the player's only geographic payoff for the round. Past 0:00 (round
 * still running) it simply stays complete.
 */
export function outlineCompletion(state: RoundState): number {
  if (state.status !== "running") return 100;
  const elapsed = state.initialSeconds - state.remainingSeconds;
  return Math.min(100, (elapsed / (state.initialSeconds * HINT_ONSET_FRACTION)) * 100);
}

/**
 * 0–100: neighbor outlines draw from t=0 and finish exactly as the clock
 * hits 0. Like outlineCompletion, any terminal status completes them —
 * post-round the full hint set is fair game.
 */
export function neighborCompletion(state: RoundState): number {
  if (state.status !== "running") return 100;
  const elapsed = state.initialSeconds - state.remainingSeconds;
  return Math.min(100, (elapsed / state.initialSeconds) * 100);
}

export function latestScoreEvent(state: RoundState): ScoreEvent | null {
  return state.scoreEvents.length ? state.scoreEvents[state.scoreEvents.length - 1] : null;
}
