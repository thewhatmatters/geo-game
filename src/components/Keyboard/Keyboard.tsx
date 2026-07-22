import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { LetterState } from "../../lib/game/useGameRound";

const ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

/**
 * True when a keystroke belongs to something other than the game: a
 * shortcut (⌘R, Ctrl+F — the letter must NOT be eaten as a guess), or
 * typing into a real text field (the save-code box in the stats overlay,
 * which is reachable while a round is still on screen).
 */
export function isForeignKeystroke(event: KeyboardEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) return true;
  const target = event.target as HTMLElement | null;
  if (!target) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

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
      if (disabled || isForeignKeystroke(event) || !/^[a-zA-Z]$/.test(event.key)) return;
      onGuess(event.key.toUpperCase());
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [disabled, onGuess]);

  return (
    <div className="keyboard" role="group" aria-label="Letter keyboard">
      {ROWS.map((row) => (
        <div className="keyboard__row" key={row}>
          {row.split("").map((letter) => {
            const state = guesses[letter];
            return (
              <motion.button
                key={letter}
                type="button"
                className={`keyboard__key${state ? ` keyboard__key--${state}` : ""}`}
                /* Color alone carries the guessed/correct/wrong state
                   visually; the label is what carries it to a screen
                   reader (and to a colorblind user hovering the key). */
                aria-label={state ? `${letter}, ${state}` : `Guess ${letter}`}
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
