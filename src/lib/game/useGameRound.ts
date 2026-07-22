import { useCallback, useEffect, useReducer } from "react";
import type { Country } from "./dailyCountry";
import {
  createRound,
  reduceRound,
  displayChars,
  outlineCompletion,
  neighborCompletion,
  latestScoreEvent,
} from "./round";
import type { DisplayChar, LetterState, RoundStatus, ScoreEvent } from "./round";

// Re-exported so existing consumers keep one import site for the round's
// public vocabulary.
export type { DisplayChar, LetterState, ScoreEvent } from "./round";
export { HINT_ONSET_FRACTION, splitIntoWordGroups } from "./round";

/** How often the real-time ticker samples the wall clock. The reducer receives the measured delta, so a late tick loses no time. */
const TICK_INTERVAL_MS = 200;

export interface GameRound {
  status: RoundStatus;
  remainingSeconds: number;
  guesses: Record<string, LetterState>;
  displayChars: DisplayChar[];
  outlineCompletion: number;
  neighborCompletion: number;
  /** Current map zoom level (1 = default framing, up to the scene's zoomMax = the whole world visible). */
  zoom: number;
  /** Furthest zoom-out reached this round — only NEW territory beyond this charges a penalty (see lib/game/zoom.ts). Surfaced so the UI can react to paid step-crossings (App's reveal pulse) without re-deriving the economy. */
  maxZoomReached: number;
  /** Feed raw wheel/pinch deltaY here — clamps zoom and applies the zoom-out time penalty internally. */
  handleZoomWheel: (deltaY: number) => void;
  guessLetter: (letter: string) => void;
  giveUp: () => void;
  /** The most recent bonus/penalty event, or null before any has happened — see ScoreEvent. */
  scoreEvent: ScoreEvent | null;
}

/**
 * Thin adapter over RoundCore (see round.ts — the rules live there, as a
 * pure reducer): this hook's only jobs are running the real-time ticker
 * and translating UI calls into dispatched events. All callbacks are
 * stable (dispatch is stable), so callers can safely list them in effect
 * dependency arrays.
 */
export function useGameRound(target: Country, zoomMax: number): GameRound {
  const [state, dispatch] = useReducer(reduceRound, undefined, () => createRound(target, zoomMax));

  // Real-time driver: samples elapsed wall-clock time and dispatches the
  // measured delta. Stops itself when the round ends (status change re-runs
  // the effect and the guard skips re-arming).
  useEffect(() => {
    if (state.status !== "running") return;
    let lastTickMs = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      dispatch({ type: "TICK", deltaSeconds: (now - lastTickMs) / 1000 });
      lastTickMs = now;
    }, TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [state.status]);

  const guessLetter = useCallback((letter: string) => dispatch({ type: "GUESS", letter }), []);
  const handleZoomWheel = useCallback((deltaY: number) => dispatch({ type: "ZOOM", deltaY }), []);
  const giveUp = useCallback(() => dispatch({ type: "GIVE_UP" }), []);

  return {
    status: state.status,
    remainingSeconds: state.remainingSeconds,
    guesses: state.guesses,
    displayChars: displayChars(state),
    outlineCompletion: outlineCompletion(state),
    neighborCompletion: neighborCompletion(state),
    zoom: state.zoom,
    maxZoomReached: state.maxZoomReached,
    handleZoomWheel,
    guessLetter,
    giveUp,
    scoreEvent: latestScoreEvent(state),
  };
}
