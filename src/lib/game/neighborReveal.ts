/** Indices of a-z/A-Z characters within `name`, in randomized order (Fisher-Yates). */
export function shuffleLetterPositions(name: string): number[] {
  const positions: number[] = [];
  for (let i = 0; i < name.length; i++) {
    if (/[A-Za-z]/.test(name[i])) positions.push(i);
  }
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  return positions;
}

/** Static placeholder glyph — kept for deterministic tests/fallback use, not the default in-game look anymore. */
export const REDACTED_CHAR = "█";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** A uniformly random uppercase letter — the "reel" glyph for a not-yet-revealed neighbor letter. */
export function randomLetter(): string {
  return ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
}

export interface RevealedChar {
  char: string;
  /** True once this position is actually revealed (locked in) — not just a non-letter passthrough. Drives per-letter styling (e.g. turning white on lock-in). */
  revealed: boolean;
}

/**
 * Renders `name` as one entry per character: the first `revealCount`
 * positions of `order` shown (in their original case, permanently locked in
 * once revealed) and every other letter replaced by `unrevealedChar()` —
 * called fresh per character, so re-invoking this on an interval with the
 * default random generator produces a slot-machine scramble effect for
 * still-hidden letters. A revealed letter is never re-rolled once its
 * position enters `revealed` (the reveal order/count only grows — see
 * useNeighborReveal). Non-letter characters (spaces, hyphens) always pass
 * through unchanged and marked `revealed: true` (they're structural, never
 * hidden).
 */
export function revealedNeighborChars(
  name: string,
  order: number[],
  revealCount: number,
  unrevealedChar: () => string = randomLetter,
): RevealedChar[] {
  const clamped = Math.max(0, Math.min(order.length, Math.round(revealCount)));
  const revealed = new Set(order.slice(0, clamped));
  return name.split("").map((char, i) => {
    if (!/[A-Za-z]/.test(char)) return { char, revealed: true };
    if (revealed.has(i)) return { char, revealed: true };
    return { char: unrevealedChar(), revealed: false };
  });
}

/**
 * Flat-string convenience wrapper around {@link revealedNeighborChars} —
 * letters are joined with no extra spacing so it reads as normal words,
 * only the name's own spaces create word breaks.
 */
export function revealedNeighborName(
  name: string,
  order: number[],
  revealCount: number,
  unrevealedChar: () => string = randomLetter,
): string {
  return revealedNeighborChars(name, order, revealCount, unrevealedChar)
    .map((c) => c.char)
    .join("");
}
