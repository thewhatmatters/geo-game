import { useEffect } from "react";
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
              <button
                key={letter}
                type="button"
                className={`keyboard__key${state ? ` keyboard__key--${state}` : ""}`}
                disabled={disabled || Boolean(state)}
                onClick={() => onGuess(letter)}
              >
                {letter}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
