import { describe, expect, it } from "vitest";
import { revealedNeighborName, shuffleLetterPositions } from "./neighborReveal";

describe("shuffleLetterPositions", () => {
  it("includes every letter index exactly once, excluding non-letters", () => {
    const order = shuffleLetterPositions("Costa Rica");
    const expectedIndices = [0, 1, 2, 3, 4, 6, 7, 8, 9].sort((a, b) => a - b);
    expect([...order].sort((a, b) => a - b)).toEqual(expectedIndices);
  });

  it("produces different orders across repeated calls (randomized, not left-to-right)", () => {
    const orders = Array.from({ length: 20 }, () => shuffleLetterPositions("Kazakhstan").join(","));
    expect(new Set(orders).size).toBeGreaterThan(1);
  });

  it("returns an empty array for a name with no letters", () => {
    expect(shuffleLetterPositions("---")).toEqual([]);
  });
});

describe("revealedNeighborName", () => {
  const name = "Costa Rica";
  const order = shuffleLetterPositions(name);

  it("blanks every letter and preserves non-letters when revealCount is 0", () => {
    const result = revealedNeighborName(name, order, 0);
    expect(result).toBe("_ _ _ _ _   _ _ _ _");
  });

  it("reveals exactly revealCount letters, matching the fixed order", () => {
    const result = revealedNeighborName(name, order, 3);
    const revealedChars = result.split(" ").filter((c) => c !== "_" && c !== "");
    expect(revealedChars.length).toBe(3);
  });

  it("reveals the full name once revealCount reaches the order length", () => {
    const result = revealedNeighborName(name, order, order.length);
    expect(result.replace(/ /g, "")).toBe(name.toUpperCase().replace(/ /g, ""));
  });

  it("is monotonic — previously revealed letters stay revealed as revealCount grows", () => {
    const at2 = revealedNeighborName(name, order, 2);
    const at5 = revealedNeighborName(name, order, 5);
    for (let i = 0; i < name.length; i++) {
      if (at2[i] !== "_" && /[A-Z]/.test(at2[i])) {
        expect(at5[i]).toBe(at2[i]);
      }
    }
  });

  it("clamps revealCount to the valid range", () => {
    expect(revealedNeighborName(name, order, -5)).toBe(revealedNeighborName(name, order, 0));
    expect(revealedNeighborName(name, order, 999)).toBe(revealedNeighborName(name, order, order.length));
  });
});
