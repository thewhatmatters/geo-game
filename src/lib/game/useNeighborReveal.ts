import { useRef } from "react";
import type { NeighborSlot } from "../geo/compass";
import { revealedNeighborName, shuffleLetterPositions } from "./neighborReveal";

export interface NeighborReveal {
  code: string;
  displayName: string;
}

/**
 * Derives each neighbor's redacted/revealing name label from `completion`
 * (0-100, same value driving that neighbor's outline draw-in per US-008).
 * Each neighbor's letter-reveal order is shuffled once (on first sight of
 * that neighbor code) and cached in a ref, so it stays stable across
 * re-renders instead of re-randomizing every frame.
 */
export function useNeighborReveal(slots: NeighborSlot[], completion: number): NeighborReveal[] {
  const ordersRef = useRef<Map<string, number[]>>(new Map());

  return slots.map((slot) => {
    let order = ordersRef.current.get(slot.code);
    if (!order) {
      order = shuffleLetterPositions(slot.country.name);
      ordersRef.current.set(slot.code, order);
    }
    const revealCount = (completion / 100) * order.length;
    return {
      code: slot.code,
      displayName: revealedNeighborName(slot.country.name, order, revealCount),
    };
  });
}
