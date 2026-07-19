import type { Country } from "./dailyCountry";
import { applyZoomDelta, ZOOM_MIN } from "./zoom";

/**
 * RoundCore — the round's entire rulebook as one pure state machine.
 * Everything that used to be split between the GameClock class and
 * useGameRound's glue (tick decay, penalties, bonuses, clamps, guess
 * validation, streak bonus, solve detection, zoom economy, score events)
 * is a plain function of (state, event) here, testable with no timers,
 * no subscriptions, no React. useGameRound is a thin adapter that feeds
 * this reducer TICK events from a real interval.
 *
 * Round 2 (US-001): the clock is a pure pacer — it only counts 60→0 and
 * drives hint reveal. Wrong-guess / streak-bonus / zoom time mutations are
 * gone; score-based economy lands in US-002/US-004. Soft-zero lockout
 * outcomes land in US-003 — until then, hitting 0:00 does not fail the
 * round (guessing continues; hints are fully drawn).
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
 * Discrete economy event for the UI to surface as a transient popup.
 * Kept as a secondsDelta shape for now (legacy score readout multiplies by
 * SCORE_SECONDS_MULTIPLIER); US-002 rewrites this to typed score deltas.
 * US-001 emits nothing — no time-based popups remain.
 */
export interface ScoreEvent {
  id: number;
  secondsDelta: number;
}

export interface RoundState {
  status: RoundStatus;
  remainingSeconds: number;
  /** Starting duration — used only as the pacer's total length (hint completion math). Never a cap for bonuses (bonuses no longer exist as time). */
  readonly initialSeconds: number;
  readonly targetName: string;
  readonly uniqueLetterCount: number;
  guesses: Record<string, LetterState>;
  /** Consecutive correct guesses, reset by any wrong guess — retained for US-002 combo; no longer grants time. */
  correctStreak: number;
  zoom: number;
  /** Furthest zoom-out reached this round — zooming back in and out over already-seen territory is free (pay-once tracking; score charge lands in US-004). */
  maxZoomReached: number;
  readonly zoomMax: number;
  /** Newest-last, capped at SCORE_EVENT_LOG_CAP — see latestScoreEvent. Empty under US-001 pure-pacer rules. */
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
 * Pure pacer tick: subtracts elapsed wall time, clamps at 0, never ends the
 * round. Soft-zero lockout (US-003) will add post-zero rules later.
 */
function tickClock(state: RoundState, seconds: number): RoundState {
  return { ...state, remainingSeconds: Math.max(0, state.remainingSeconds - seconds) };
}

function reduceGuess(state: RoundState, rawLetter: string): RoundState {
  const letter = rawLetter.toUpperCase();
  if (!/^[A-Z]$/.test(letter) || state.guesses[letter]) return state;

  const required = uniqueLettersOf(state.targetName);

  if (required.has(letter)) {
    const guesses = { ...state.guesses, [letter]: "correct" as const };
    const correctStreak = state.correctStreak + 1;
    let next: RoundState = { ...state, guesses, correctStreak };

    const solved = [...required].every((l) => guesses[l] === "correct");
    if (solved) next = { ...next, status: "solved" };
    return next;
  }

  return { ...state, guesses: { ...state.guesses, [letter]: "wrong" as const }, correctStreak: 0 };
}

function reduceZoom(state: RoundState, deltaY: number): RoundState {
  const result = applyZoomDelta(state.zoom, deltaY, state.maxZoomReached, state.zoomMax);
  // Zoom never costs time (US-001). Step tracking (maxZoomReached) stays so
  // UI pulses / US-004 score charges can still key off newly-crossed steps.
  // Zoom stays available after the round ends so the player can explore.
  return { ...state, zoom: result.zoom, maxZoomReached: result.maxZoomReached };
}

export function reduceRound(state: RoundState, event: RoundEvent): RoundState {
  // ZOOM is the one event that stays live after the round ends (free, see
  // reduceZoom); everything else is a no-op once the round has terminal status.
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
 * the player's only geographic payoff for the round. At remainingSeconds=0
 * while still running (soft zero), elapsed hits 100% of the pacer so both
 * outlines are fully drawn.
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
