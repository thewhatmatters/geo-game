import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CORRECT_STREAK_BONUS_INTERVAL,
  CORRECT_STREAK_BONUS_SECONDS,
  GameClock,
  getPenaltySeconds,
  ROUND_DURATION_SECONDS,
} from "./clock";
import type { ClockStatus } from "./clock";
import type { Country } from "./dailyCountry";
import { applyZoomDelta, ZOOM_MIN } from "./zoom";

/**
 * Fraction of the 60s clock the target outline takes to fully draw. Neighbor
 * outlines draw simultaneously with the target from t=0 rather than waiting
 * for this threshold — see `neighborCompletion`. The trivia overlay is no
 * longer gated by this (see `showTrivia`) — it stays up for the whole round.
 */
export const HINT_ONSET_FRACTION = 0.45;

export type LetterState = "correct" | "wrong";

export interface DisplayChar {
  char: string;
  /** True once a correctly-guessed letter is locked in, or immediately for non-letter characters (spaces, hyphens) — those are never hidden. */
  revealed: boolean;
  /** False for spaces/hyphens/etc — rendered as a plain gap between boxed cells rather than a cell of its own. */
  isLetter: boolean;
}

function uniqueLettersOf(name: string): Set<string> {
  return new Set(name.toUpperCase().replace(/[^A-Z]/g, "").split(""));
}

/**
 * One discrete time-economy event (a bonus or a penalty) for the UI to
 * surface as a transient "+20"/"-150" popup next to the score — deliberately
 * NOT fired for ordinary per-tick decay, only for the flat one-time
 * adjustments (streak bonus, wrong guess, zoom-out). `id` is a monotonic
 * counter (not a timestamp — keeps this file free of Date.now()) so the UI
 * can key a fresh animation off it even if the same secondsDelta repeats
 * back to back.
 */
export interface ScoreEvent {
  id: number;
  secondsDelta: number;
}

export interface GameRound {
  status: ClockStatus;
  remainingSeconds: number;
  guesses: Record<string, LetterState>;
  displayChars: DisplayChar[];
  outlineCompletion: number;
  neighborsVisible: boolean;
  neighborCompletion: number;
  /** Whether the trivia overlay should show — only during the target's own early draw-in phase. */
  showTrivia: boolean;
  /** Current map zoom level (1 = default framing, up to the scene's zoomMax = the whole world visible). */
  zoom: number;
  /** Feed raw wheel/pinch deltaY here — clamps zoom and applies the zoom-out time penalty internally. */
  handleZoomWheel: (deltaY: number) => void;
  guessLetter: (letter: string) => void;
  giveUp: () => void;
  /** The most recent bonus/penalty event, or null before any has happened — see ScoreEvent. */
  scoreEvent: ScoreEvent | null;
}

/** Drives a single round's clock, letter-guess state, and derived display/outline values for a target country. */
export function useGameRound(target: Country, zoomMax: number): GameRound {
  const clockRef = useRef<GameClock | null>(null);
  if (!clockRef.current) clockRef.current = new GameClock();
  const clock = clockRef.current;

  const requiredLetters = useMemo(() => uniqueLettersOf(target.name), [target.name]);

  const [snapshot, setSnapshot] = useState(clock.getSnapshot());
  const [guesses, setGuesses] = useState<Record<string, LetterState>>({});

  const [zoom, setZoom] = useState(ZOOM_MIN);
  // Kept in sync every render (not just via effect) so handleZoomWheel always
  // reads the latest value even across several wheel events fired before the
  // next render commits.
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const maxZoomReachedRef = useRef(ZOOM_MIN);
  // Consecutive correct guesses, reset by any wrong guess — every
  // CORRECT_STREAK_BONUS_INTERVAL-th one grants a flat time bonus.
  const correctStreakRef = useRef(0);

  const [scoreEvent, setScoreEvent] = useState<ScoreEvent | null>(null);
  const scoreEventIdRef = useRef(0);
  function emitScoreEvent(secondsDelta: number): void {
    scoreEventIdRef.current += 1;
    setScoreEvent({ id: scoreEventIdRef.current, secondsDelta });
  }

  useEffect(() => {
    const unsubscribe = clock.subscribe(setSnapshot);
    clock.start();
    return () => {
      unsubscribe();
      clock.stop();
    };
  }, [clock]);

  function guessLetter(rawLetter: string): void {
    if (snapshot.status !== "running") return;
    const letter = rawLetter.toUpperCase();
    if (!/^[A-Z]$/.test(letter) || guesses[letter]) return;

    if (requiredLetters.has(letter)) {
      const nextGuesses = { ...guesses, [letter]: "correct" as const };
      setGuesses(nextGuesses);
      correctStreakRef.current += 1;
      if (correctStreakRef.current % CORRECT_STREAK_BONUS_INTERVAL === 0) {
        clock.applyBonus(CORRECT_STREAK_BONUS_SECONDS);
        emitScoreEvent(CORRECT_STREAK_BONUS_SECONDS);
      }
      const solved = [...requiredLetters].every((l) => nextGuesses[l] === "correct");
      if (solved) clock.solve();
    } else {
      setGuesses((prev) => ({ ...prev, [letter]: "wrong" }));
      correctStreakRef.current = 0;
      clock.applyWrongGuess(target.unique_letters);
      emitScoreEvent(-getPenaltySeconds(target.unique_letters));
    }
  }

  function giveUp(): void {
    clock.giveUp();
  }

  // Stable identity (only depends on the stable `clock` ref) so callers can
  // safely list it in a useEffect dependency array without re-registering
  // native event listeners on every wheel tick. Deliberately NOT gated on
  // round status — zooming stays available after the round ends (solved or
  // failed) so the player can freely explore the revealed map. The time
  // penalty itself still only applies while running: clock.applyPenalty
  // already no-ops once the clock has stopped, so a post-round zoom-out
  // never costs anything (there's no clock left to dock).
  const handleZoomWheel = useCallback(
    (deltaY: number) => {
      const result = applyZoomDelta(zoomRef.current, deltaY, maxZoomReachedRef.current, zoomMax);
      maxZoomReachedRef.current = result.maxZoomReached;
      if (result.penaltySeconds > 0) {
        clock.applyPenalty(result.penaltySeconds);
        emitScoreEvent(-result.penaltySeconds);
      }
      zoomRef.current = result.zoom;
      setZoom(result.zoom);
    },
    [clock, zoomMax],
  );

  const displayChars: DisplayChar[] = target.name
    .toUpperCase()
    .split("")
    .map((char) => {
      const isLetter = /[A-Z]/.test(char);
      return { char, isLetter, revealed: isLetter ? guesses[char] === "correct" : true };
    });

  const elapsedSeconds = ROUND_DURATION_SECONDS - snapshot.remainingSeconds;
  const onsetElapsedSeconds = ROUND_DURATION_SECONDS * HINT_ONSET_FRACTION;

  const outlineCompletion = Math.min(100, (elapsedSeconds / onsetElapsedSeconds) * 100);
  // Stays up for the whole round AND after it ends — the trivia fact is
  // part of the reveal, not just an in-round hint, so a solved/failed
  // player should still be able to read it rather than have it vanish the
  // instant the clock stops.
  const showTrivia = true;

  // Neighbor outlines draw in simultaneously with the target, from the very
  // start of the round, finishing at 100% exactly as the clock hits 0 — not
  // gated behind the target's own draw-in phase.
  const neighborsVisible = true;
  const neighborCompletion = Math.min(100, (elapsedSeconds / ROUND_DURATION_SECONDS) * 100);

  return {
    status: snapshot.status,
    remainingSeconds: snapshot.remainingSeconds,
    guesses,
    displayChars,
    outlineCompletion,
    neighborsVisible,
    neighborCompletion,
    showTrivia,
    zoom,
    handleZoomWheel,
    guessLetter,
    giveUp,
    scoreEvent,
  };
}
