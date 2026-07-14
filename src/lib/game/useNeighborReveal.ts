import { useEffect, useReducer, useRef } from "react";
import type { NeighborSlot } from "../geo/scene";
import { revealedNeighborChars, shuffleLetterPositions, type RevealedChar } from "./neighborReveal";

/** How often not-yet-revealed letters re-roll to a new random glyph — the slot-machine spin rate. */
const SCRAMBLE_INTERVAL_MS = 120;

export interface NeighborReveal {
  code: string;
  /** Flat string (letters + spaces) — convenient for width estimation/layout. */
  displayName: string;
  /** Per-character reveal state, same content as displayName — drives per-letter styling (e.g. turning white on lock-in). */
  chars: RevealedChar[];
}

/**
 * Derives each neighbor's scrambling/revealing name label from `completion`
 * (0-100, same value driving that neighbor's outline draw-in per US-008).
 * Each neighbor's letter-reveal order is shuffled once (on first sight of
 * that neighbor code) and cached in a ref, so it stays stable across
 * re-renders instead of re-randomizing every frame. Not-yet-revealed
 * letters re-roll to a new random glyph on SCRAMBLE_INTERVAL_MS (a
 * slot-machine effect); a letter that's actually been revealed is locked
 * in permanently — see revealedNeighborName's `revealed` set, which only
 * grows as `completion` increases.
 */
export function useNeighborReveal(slots: NeighborSlot[], completion: number): NeighborReveal[] {
  const ordersRef = useRef<Map<string, number[]>>(new Map());
  const [, forceRescramble] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const id = setInterval(forceRescramble, SCRAMBLE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return slots.map((slot) => {
    let order = ordersRef.current.get(slot.code);
    if (!order) {
      order = shuffleLetterPositions(slot.country.name);
      ordersRef.current.set(slot.code, order);
    }
    const revealCount = (completion / 100) * order.length;
    const chars = revealedNeighborChars(slot.country.name, order, revealCount);
    return {
      code: slot.code,
      displayName: chars.map((c) => c.char).join(""),
      chars,
    };
  });
}
