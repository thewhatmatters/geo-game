import type { Country } from "./dailyCountry";
import { applyZoomDelta, zoomStepsCrossed, ZOOM_MIN } from "./zoom";
import {
  applyScoreDelta,
  comboMultiplier,
  correctLetterPoints,
  wrongLetterPenalty,
  ZOOM_PENALTY_CAP,
  ZOOM_STEP_PENALTY,
} from "./score";

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
 * remainingSeconds. Reaching 0:00 does not end the round: it flips the
 * round into LOCKOUT mode — guessing stays fully enabled with all hints
 * drawn, but wrong letters now burn a finite attempt budget, so the soft
 * zero trades a hard deadline for mounting tension.
 */

export const ROUND_DURATION_SECONDS = 60;

/**
 * Wrong guesses allowed after the clock hits 0:00 before the round locks
 * out. Only wrong letters guessed *during* lockout burn budget — anything
 * spent while the clock was still running is already paid for in score.
 * The lockout UI treatment (attempt pips, warning banner) lands separately;
 * this constant is the single source of truth it reads from.
 */
export const LOCKOUT_ATTEMPT_BUDGET = 5;

/**
 * Fraction of the clock the target outline takes to fully draw. Neighbor
 * outlines draw simultaneously with the target from t=0, finishing at 100%
 * exactly as the clock hits 0 — see the selectors below.
 */
export const HINT_ONSET_FRACTION = 0.45;

/**
 * The round's four terminal outcomes plus the live state. `solved` and
 * `solved_late` both count as solves (see isSolveStatus) and differ only in
 * whether the clock was still running — only `solved` earns the time bonus.
 * `locked_out` (lockout budget exhausted) and `gave_up` are failures.
 */
export type RoundStatus = "running" | "solved" | "solved_late" | "locked_out" | "gave_up";

/** Did this status end the round with the country identified? */
export function isSolveStatus(status: RoundStatus): boolean {
  return status === "solved" || status === "solved_late";
}

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
 * "-150" popup next to the score. The clock emits nothing — it's a pure
 * pacer — so every event here comes from a scoring player action. `id` is a
 * monotonic counter so the UI can key a fresh animation off it even if the
 * same delta repeats back to back.
 *
 * `delta` is the rule's nominal delta, NOT the clamped change to the
 * running total: a -200 at a score of 50 still reports -200 while the
 * score floors at 0. The popup shows what the rule charged you.
 */
export interface ScoreEvent {
  id: number;
  type: "correct" | "wrong" | "zoom";
  delta: number;
  /** The combo multiplier in force after this event — x1 on any wrong letter. */
  multiplier: number;
}

export interface RoundState {
  status: RoundStatus;
  /** Counts down from initialSeconds to 0 via TICKs only — never mutated by guess or zoom events. */
  remainingSeconds: number;
  readonly initialSeconds: number;
  readonly targetName: string;
  readonly uniqueLetterCount: number;
  guesses: Record<string, LetterState>;
  /** Consecutive correct guesses, reset by any wrong guess — the combo multiplier is derived from this (see lib/game/score.ts). */
  correctStreak: number;
  /** Running event-sourced score, already floored at SCORE_FLOOR. Never a function of the clock. */
  score: number;
  zoom: number;
  /** Furthest zoom-out reached this round — lets consumers distinguish new territory from re-crossed territory (see lib/game/zoom.ts). */
  maxZoomReached: number;
  readonly zoomMax: number;
  /** Newest-last — see latestScoreEvent. One entry per scoring action; the clock never appends. */
  scoreEvents: ScoreEvent[];
  /** Wrong guesses left before lockout ends the round. Only decremented while inLockout — full budget until the clock hits 0. */
  lockoutAttemptsRemaining: number;
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
    score: 0,
    zoom: ZOOM_MIN,
    maxZoomReached: ZOOM_MIN,
    zoomMax,
    scoreEvents: [],
    lockoutAttemptsRemaining: LOCKOUT_ATTEMPT_BUDGET,
  };
}

/**
 * Is the round past 0:00 and running on the attempt budget rather than the
 * clock? Derived, not stored — the clock reaching 0 IS the lockout, so
 * there's no separate flag to keep in sync.
 */
export function inLockout(state: RoundState): boolean {
  return state.status === "running" && state.remainingSeconds <= 0;
}

/** Pure tick decay: clamps at 0 and keeps the round running — 0:00 is not a failure, it's the flip into lockout (see inLockout). */
function tickClock(state: RoundState, seconds: number): RoundState {
  if (state.remainingSeconds <= 0) return state;
  return { ...state, remainingSeconds: Math.max(0, state.remainingSeconds - seconds) };
}

/** Appends a score event and folds its delta into the running total (floored). */
function withScoreEvent(
  state: RoundState,
  event: Omit<ScoreEvent, "id">,
): RoundState {
  return {
    ...state,
    score: applyScoreDelta(state.score, event.delta),
    scoreEvents: [...state.scoreEvents, { ...event, id: state.scoreEvents.length + 1 }],
  };
}

function reduceGuess(state: RoundState, rawLetter: string): RoundState {
  const letter = rawLetter.toUpperCase();
  if (!/^[A-Z]$/.test(letter) || state.guesses[letter]) return state;

  const required = uniqueLettersOf(state.targetName);

  if (required.has(letter)) {
    const guesses = { ...state.guesses, [letter]: "correct" as const };
    const correctStreak = state.correctStreak + 1;
    let next = withScoreEvent({ ...state, guesses, correctStreak }, {
      type: "correct",
      delta: correctLetterPoints(correctStreak),
      multiplier: comboMultiplier(correctStreak),
    });
    const solved = [...required].every((l) => guesses[l] === "correct");
    // Beating the clock and beating the lockout are both solves, but only
    // the former has seconds left to convert into a time bonus.
    if (solved) next = { ...next, status: inLockout(state) ? "solved_late" : "solved" };
    return next;
  }

  const guesses = { ...state.guesses, [letter]: "wrong" as const };
  // Wrong letters cost score in both phases; in lockout they additionally
  // burn an attempt, and the last one ends the round.
  const locked = inLockout(state);
  const lockoutAttemptsRemaining = locked
    ? state.lockoutAttemptsRemaining - 1
    : state.lockoutAttemptsRemaining;
  const status: RoundStatus = locked && lockoutAttemptsRemaining <= 0 ? "locked_out" : state.status;
  return withScoreEvent({ ...state, guesses, correctStreak: 0, lockoutAttemptsRemaining, status }, {
    type: "wrong",
    delta: -wrongLetterPenalty(state.uniqueLetterCount),
    multiplier: comboMultiplier(0),
  });
}

function reduceZoom(state: RoundState, deltaY: number): RoundState {
  const result = applyZoomDelta(state.zoom, deltaY, state.maxZoomReached, state.zoomMax);
  const moved = { ...state, zoom: result.zoom, maxZoomReached: result.maxZoomReached };

  // Terminal rounds remain explorable, but their economy is closed.
  if (state.status !== "running") return moved;

  // The high-water mark is also the pay-once ledger: only boundaries above
  // the furthest previously reached step are new. Comparing capped cumulative
  // costs makes a single large wheel/pinch movement obey the per-round cap.
  const previousSteps = zoomStepsCrossed(state.maxZoomReached);
  const reachedSteps = zoomStepsCrossed(result.maxZoomReached);
  const previousCost = Math.min(ZOOM_PENALTY_CAP, previousSteps * ZOOM_STEP_PENALTY);
  const reachedCost = Math.min(ZOOM_PENALTY_CAP, reachedSteps * ZOOM_STEP_PENALTY);
  const charge = reachedCost - previousCost;

  if (charge <= 0) return moved;
  return withScoreEvent(moved, {
    type: "zoom",
    delta: -charge,
    multiplier: currentMultiplier(state),
  });
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
    // Available in both phases — the guard above only blocks it once the
    // round is already over.
    case "GIVE_UP":
      return { ...state, status: "gave_up" };
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

/** The multiplier the NEXT correct letter would earn — what the UI shows as the live combo. */
export function currentMultiplier(state: RoundState): number {
  return comboMultiplier(state.correctStreak + 1);
}

export function latestScoreEvent(state: RoundState): ScoreEvent | null {
  return state.scoreEvents.length ? state.scoreEvents[state.scoreEvents.length - 1] : null;
}
