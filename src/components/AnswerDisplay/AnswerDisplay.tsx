import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { DisplayChar, LetterState } from "../../lib/game/useGameRound";

export interface AnswerDisplayProps {
  words: DisplayChar[][];
  guesses: Record<string, LetterState>;
}

/** Answer slots plus the shared reject surface for an incorrect guess. */
export function AnswerDisplay({ words, guesses }: AnswerDisplayProps) {
  const reduceMotion = useReducedMotion();
  const previousGuesses = useRef(guesses);
  const latestGuess = Object.keys(guesses).find((letter) => !previousGuesses.current[letter]);
  const rejected = latestGuess !== undefined && guesses[latestGuess] === "wrong";

  useEffect(() => {
    previousGuesses.current = guesses;
  }, [guesses]);

  return (
    <motion.div
      className="display-name"
      data-testid="display-name"
      data-feedback={rejected ? "reject" : undefined}
      animate={
        rejected && !reduceMotion
          ? {
              x: [0, -7, 6, -4, 3, 0],
              boxShadow: [
                "0 0 0 1px rgba(255,70,70,0)",
                "0 0 0 1px rgba(255,70,70,0.95), 0 0 14px rgba(255,70,70,0.45)",
                "0 0 0 1px rgba(255,70,70,0)",
              ],
            }
          : { x: 0, boxShadow: "0 0 0 1px rgba(255,70,70,0)" }
      }
      transition={{ duration: reduceMotion ? 0 : 0.42, ease: "easeOut" }}
    >
      {words.map((word, wordIndex) => (
        <div className="display-name__group" key={wordIndex}>
          {word.map((displayChar, charIndex) => (
            <span className="display-name__cell" key={charIndex}>
              {displayChar.revealed && (
                <motion.span
                  className="display-name__letter"
                  initial={reduceMotion ? false : { y: -14, opacity: 0, filter: "blur(4px)" }}
                  animate={{ y: reduceMotion ? 0 : [-14, 3, 0], opacity: 1, filter: "blur(0px)" }}
                  transition={{ duration: reduceMotion ? 0 : 0.36, ease: "easeOut" }}
                >
                  {displayChar.char}
                </motion.span>
              )}
            </span>
          ))}
        </div>
      ))}
    </motion.div>
  );
}
