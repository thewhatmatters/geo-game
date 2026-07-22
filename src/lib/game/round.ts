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
 */

export const ROUND_DURATION_SECONDS = 60;

/**
 * Placeholder values pending playtesting (see CLAUDE.md "Open design
 * decisions" — exact tiers/values are explicitly not finalized). Keep as a
 * tunable table, not inline arithmetic, so retuning doesn't touch logic.
 */
export const PENALTY_TIERS: ReadonlyArray<{
  maxUniqueLetters: number;
  penaltySeconds: number;
}> = [
  { maxUniqueLetters: 5, penaltySeconds: 20 },
  { maxUniqueLetters: 9, penaltySeconds: 15 },
  { maxUniqueLetters: Infinity, penaltySeconds: 10 },
];

export function getPenaltySeconds(uniqueLetterCount: number): number {
  const tier = PENALTY_TIERS.find((t) => uniqueLetterCount <= t.maxUniqueLetters);
  return tier ? tier.penaltySeconds : PENALTY_TIERS[PENALTY_TIERS.length - 1].penaltySeconds;
}

/** Every this many CONSECUTIVE correct letter guesses (streak reset by any wrong guess) grants a flat time bonus — positive reinforcement to offset the wrong-guess-only penalty design. */
export const CORRECT_STREAK_BONUS_INTERVAL = 2;
export const CORRECT_STREAK_BONUS_SECONDS = 2;

/**
 * Fraction of the clock the target outline takes to fully draw. Neighbor
 * outlines draw simultaneously with the target from t=0, finishing at 100%
 * exactly as the clock hits 0 — see the selectors below.
 */
export const HINT_ONSET_FRACTION = 0.45;

/** How many discrete bonus/penalty events the state retains — the UI only ever shows the latest; the rest exist for tests/debugging. */
const SCORE_EVENT_LOG_CAP = 8;

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
 * One discrete time-economy event (a bonus or a penalty) for the UI to
 * surface as a transient "+20"/"-150" popup next to the score — deliberately
 * NOT emitted for ordinary per-tick decay, only for the flat one-time
 * adjustments (streak bonus, wrong guess, zoom-out). `id` is a monotonic
 * counter so the UI can key a fresh animation off it even if the same
 * secondsDelta repeats back to back.
 */
export interface ScoreEvent {
  id: number;
  secondsDelta: number;
}

export interface RoundState {
  status: RoundStatus;
  remainingSeconds: number;
  /** A bonus can never push remainingSeconds past where the round started — otherwise a long correct streak could bank unbounded time. */
  readonly initialSeconds: number;
  readonly targetName: string;
  readonly uniqueLetterCount: number;
  guesses: Record<string, LetterState>;
  /** Consecutive correct guesses, reset by any wrong guess — every CORRECT_STREAK_BONUS_INTERVAL-th one grants a flat time bonus. */
  correctStreak: number;
  zoom: number;
  /** Furthest zoom-out reached this round — zooming back in and out over already-seen territory never re-charges (see lib/game/zoom.ts). */
  maxZoomReached: number;
  readonly zoomMax: number;
  /** Newest-last, capped at SCORE_EVENT_LOG_CAP — see latestScoreEvent. */
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

function pushScoreEvent(state: RoundState, secondsDelta: number): RoundState {
  const lastId = state.scoreEvents.length ? state.scoreEvents[state.scoreEvents.length - 1].id : 0;
  const scoreEvents = [...state.scoreEvents, { id: lastId + 1, secondsDelta }].slice(
    -SCORE_EVENT_LOG_CAP,
  );
  return { ...state, scoreEvents };
}

/** Time deduction with tick semantics: hitting 0 fails the round. Shared by TICK decay, wrong-guess penalties, and zoom-out charges. */
function deductTime(state: RoundState, seconds: number): RoundState {
  const remainingSeconds = Math.max(0, state.remainingSeconds - seconds);
  if (remainingSeconds <= 0) {
    return { ...state, remainingSeconds: 0, status: "failed" };
  }
  return { ...state, remainingSeconds };
}

function reduceGuess(state: RoundState, rawLetter: string): RoundState {
  const letter = rawLetter.toUpperCase();
  if (!/^[A-Z]$/.test(letter) || state.guesses[letter]) return state;

  const required = uniqueLettersOf(state.targetName);

  if (required.has(letter)) {
    const guesses = { ...state.guesses, [letter]: "correct" as const };
    const correctStreak = state.correctStreak + 1;
    let next: RoundState = { ...state, guesses, correctStreak };

    if (correctStreak % CORRECT_STREAK_BONUS_INTERVAL === 0) {
      next = {
        ...next,
        remainingSeconds: Math.min(next.initialSeconds, next.remainingSeconds + CORRECT_STREAK_BONUS_SECONDS),
      };
      next = pushScoreEvent(next, CORRECT_STREAK_BONUS_SECONDS);
    }

    const solved = [...required].every((l) => guesses[l] === "correct");
    if (solved) next = { ...next, status: "solved" };
    return next;
  }

  const guesses = { ...state.guesses, [letter]: "wrong" as const };
  const penalty = getPenaltySeconds(state.uniqueLetterCount);
  let next: RoundState = { ...state, guesses, correctStreak: 0 };
  next = pushScoreEvent(next, -penalty);
  return deductTime(next, penalty);
}

function reduceZoom(state: RoundState, deltaY: number): RoundState {
  const result = applyZoomDelta(state.zoom, deltaY, state.maxZoomReached, state.zoomMax);
  let next: RoundState = { ...state, zoom: result.zoom, maxZoomReached: result.maxZoomReached };
  // Zoom stays available after the round ends so the player can explore the
  // revealed map — but the time cost only applies while running (there's no
  // clock left to dock afterwards).
  if (result.penaltySeconds > 0 && state.status === "running") {
    next = pushScoreEvent(next, -result.penaltySeconds);
    next = deductTime(next, result.penaltySeconds);
  }
  return next;
}

export function reduceRound(state: RoundState, event: RoundEvent): RoundState {
  // ZOOM is the one event that stays live after the round ends (free, see
  // reduceZoom); everything else is a no-op once the clock has stopped.
  if (event.type === "ZOOM") return reduceZoom(state, event.deltaY);
  if (state.status !== "running") return state;

  switch (event.type) {
    case "TICK":
      return deductTime(state, event.deltaSeconds);
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
 * round — it's the primary hint. Any terminal status (solved, timed out,
 * give-up) completes it: on failure the name stays hidden, so the finished
 * shape is the player's only geographic payoff for the round.
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

/**
 * Splits the target name's per-character reveal state at space boundaries
 * into per-word groups — each group renders as its own bordered box row,
 * with a plain gap between words rather than a boxed cell for the space
 * itself.
 */
export function splitIntoWordGroups(chars: DisplayChar[]): DisplayChar[][] {
  const words: DisplayChar[][] = [];
  let current: DisplayChar[] = [];
  for (const c of chars) {
    if (c.char === " ") {
      if (current.length) words.push(current);
      current = [];
    } else {
      current.push(c);
    }
  }
  if (current.length) words.push(current);
  return words;
}
