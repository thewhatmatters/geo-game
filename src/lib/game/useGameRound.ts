import { useEffect, useMemo, useRef, useState } from "react";
import { GameClock, ROUND_DURATION_SECONDS } from "./clock";
import type { ClockStatus } from "./clock";
import type { Country } from "./dailyCountry";

/**
 * Fraction of the 60s clock the target outline takes to fully draw (and,
 * per US-008, the point neighbor hints begin appearing) — see CLAUDE.md's
 * "first ~40-50% of the clock" hint-timing rule.
 */
export const HINT_ONSET_FRACTION = 0.45;

export type LetterState = "correct" | "wrong";

function uniqueLettersOf(name: string): Set<string> {
  return new Set(name.toUpperCase().replace(/[^A-Z]/g, "").split(""));
}

export interface GameRound {
  status: ClockStatus;
  remainingSeconds: number;
  guesses: Record<string, LetterState>;
  displayName: string;
  outlineCompletion: number;
  guessLetter: (letter: string) => void;
  giveUp: () => void;
}

/** Drives a single round's clock, letter-guess state, and derived display/outline values for a target country. */
export function useGameRound(target: Country): GameRound {
  const clockRef = useRef<GameClock | null>(null);
  if (!clockRef.current) clockRef.current = new GameClock();
  const clock = clockRef.current;

  const requiredLetters = useMemo(() => uniqueLettersOf(target.name), [target.name]);

  const [snapshot, setSnapshot] = useState(clock.getSnapshot());
  const [guesses, setGuesses] = useState<Record<string, LetterState>>({});

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
      const solved = [...requiredLetters].every((l) => nextGuesses[l] === "correct");
      if (solved) clock.solve();
    } else {
      setGuesses((prev) => ({ ...prev, [letter]: "wrong" }));
      clock.applyWrongGuess(target.unique_letters);
    }
  }

  function giveUp(): void {
    clock.giveUp();
  }

  const displayName = target.name
    .toUpperCase()
    .split("")
    .map((char) => (/[A-Z]/.test(char) ? (guesses[char] === "correct" ? char : "_") : char))
    .join(" ");

  const outlineCompletion = Math.min(
    100,
    ((ROUND_DURATION_SECONDS - snapshot.remainingSeconds) /
      (ROUND_DURATION_SECONDS * HINT_ONSET_FRACTION)) *
      100,
  );

  return {
    status: snapshot.status,
    remainingSeconds: snapshot.remainingSeconds,
    guesses,
    displayName,
    outlineCompletion,
    guessLetter,
    giveUp,
  };
}
