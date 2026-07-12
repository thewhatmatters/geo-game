import trivia from "../../data/trivia.json";

export interface TriviaOverlayProps {
  /** Country code, same ISO scheme as countries.json, used to look up the fact. */
  code: string;
}

const facts: Record<string, string> = trivia;

/**
 * Renders on top of the target CountryOutline while it draws. Hidden
 * entirely (not blank/undefined text) for the ~190 countries without a
 * fact yet, since trivia.json is a stub until US-013 lands.
 */
export function TriviaOverlay({ code }: TriviaOverlayProps) {
  const fact = facts[code];
  if (!fact) return null;

  return (
    <p className="trivia-overlay" data-testid="trivia-overlay">
      {fact}
    </p>
  );
}
