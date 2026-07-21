import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { LetterState } from "../../lib/game/useGameRound";

const ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

export interface KeyboardProps {
  guesses: Record<string, LetterState>;
  onGuess: (letter: string) => void;
  disabled?: boolean;
}

/**
 * On-screen A-Z keyboard — the visual source of truth for per-letter
 * guessed/correct/wrong state. A global keydown listener dispatches to the
 * same onGuess handler as clicking a key, so both input paths behave
 * identically (Wordle's pattern).
 */
export function Keyboard({ guesses, onGuess, disabled = false }: KeyboardProps) {
  const reduceMotion = useReducedMotion();
  const previousGuesses = useRef(guesses);
  const latestGuess = Object.keys(guesses).find((letter) => !previousGuesses.current[letter]);

  useEffect(() => {
    previousGuesses.current = guesses;
  }, [guesses]);

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (disabled || !/^[a-zA-Z]$/.test(event.key)) return;
      onGuess(event.key.toUpperCase());
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [disabled, onGuess]);

  return (
    <div className="keyboard">
      {ROWS.map((row) => (
        <div className="keyboard__row" key={row}>
          {row.split("").map((letter) => {
            const state = guesses[letter];
            return (
              <motion.button
                key={letter}
                type="button"
                className={`keyboard__key${state ? ` keyboard__key--${state}` : ""}`}
                disabled={disabled || Boolean(state)}
                onClick={() => onGuess(letter)}
                animate={
                  !reduceMotion && latestGuess === letter && state === "wrong"
                    ? { x: [0, -5, 5, -3, 3, 0], backgroundColor: ["#f2f2f2", "#8f2525", "#2a2a2a"] }
                    : { x: 0 }
                }
                transition={{ duration: reduceMotion ? 0 : 0.38, ease: "easeOut" }}
              >
                {letter}
              </motion.button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
