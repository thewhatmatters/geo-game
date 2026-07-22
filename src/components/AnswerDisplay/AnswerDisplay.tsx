import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { DisplayChar, LetterState } from "../../lib/game/useGameRound";

export interface AnswerDisplayProps {
  words: DisplayChar[][];
  guesses: Record<string, LetterState>;
}

export type AnswerSize = "md" | "sm" | "xs";

/** Letter counts above which the slots step down a size — see answerSize. */
const TOTAL_LETTERS_SM = 12;
const TOTAL_LETTERS_XS = 18;
/** A single word can't wrap, so a long one constrains the row on its own. */
const LONGEST_WORD_SM = 10;
const LONGEST_WORD_XS = 14;

/**
 * Slot size bucket for a name, driving the `--cell-density` multiplier in
 * index.css. The dataset's extremes are real ("South Georgia and the South
 * Sandwich Islands" — 39 letters over 7 words) and the slots are
 * fixed-width by design (a cell that grew to fit its letter would reflow
 * the row on every correct guess), so the fitting has to happen up front,
 * from the name itself. Independent of the narrow-viewport shrink, which
 * multiplies on top of it.
 */
export function answerSize(words: DisplayChar[][]): AnswerSize {
  const total = words.reduce((sum, word) => sum + word.length, 0);
  const longest = words.reduce((max, word) => Math.max(max, word.length), 0);
  if (total > TOTAL_LETTERS_XS || longest > LONGEST_WORD_XS) return "xs";
  if (total > TOTAL_LETTERS_SM || longest > LONGEST_WORD_SM) return "sm";
  return "md";
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
      data-size={answerSize(words)}
      data-feedback={rejected ? "reject" : undefined}
      /* The slots ARE the answer's live state; without a text equivalent a
         screen reader is told nothing as letters land. Underscores read as
         the blanks they are, and the per-cell markup below goes aria-hidden
         so the same content isn't announced twice. */
      role="status"
      aria-label={`Answer: ${words
        .map((word) => word.map((c) => (c.revealed ? c.char : "_")).join(""))
        .join(" ")}`}
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
        <div className="display-name__group" key={wordIndex} aria-hidden="true">
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
