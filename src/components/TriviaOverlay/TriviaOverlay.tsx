import trivia from "../../data/trivia.json";
import { getCountry } from "../../lib/game/dailyCountry";

/**
 * Seconds of clock elapsed before the fun-fact line appears.
 * 0 = visible from the start of the round (shipped default).
 * Raise this (or pass `revealAfterSeconds`) to delay the reveal mid-round.
 */
export const FUN_FACT_REVEAL_AFTER_SECONDS = 0;

export interface TriviaOverlayProps {
  /** Country code, same ISO scheme as countries.json, used to look up the fact. */
  code: string;
  /**
   * Seconds elapsed in the current round. Used only for fun-fact reveal
   * timing; the trivia question is always shown when present. After the
   * round ends, pass a value ≥ `revealAfterSeconds` (e.g. full duration)
   * so the fun fact stays readable with the question.
   */
  elapsedSeconds?: number;
  /**
   * Override for {@link FUN_FACT_REVEAL_AFTER_SECONDS}. Kept as a prop so
   * reveal timing is a one-line change at the call site or via the constant.
   */
  revealAfterSeconds?: number;
}

const facts: Record<string, string> = trivia;

/**
 * Renders the trivia question (when present) and the country's fun_fact
 * line beneath it. Hidden entirely when both are absent; a missing/empty
 * fun_fact never leaves an empty container.
 */
export function TriviaOverlay({
  code,
  elapsedSeconds = 0,
  revealAfterSeconds = FUN_FACT_REVEAL_AFTER_SECONDS,
}: TriviaOverlayProps) {
  const question = facts[code]?.trim() || "";
  const funFact = getCountry(code)?.fun_fact?.trim() || "";
  const showFunFact = funFact.length > 0 && elapsedSeconds >= revealAfterSeconds;

  if (!question && !showFunFact) return null;

  return (
    <div className="trivia-overlay" data-testid="trivia-overlay">
      {question ? (
        <p className="trivia-overlay__question" data-testid="trivia-question">
          {question}
        </p>
      ) : null}
      {showFunFact ? (
        <p className="trivia-overlay__fun-fact" data-testid="trivia-fun-fact">
          {funFact}
        </p>
      ) : null}
    </div>
  );
}
