import { describe, expect, it } from "vitest";
import {
  randomLetter,
  REDACTED_CHAR,
  revealedNeighborChars,
  revealedNeighborName,
  shuffleLetterPositions,
} from "./neighborReveal";

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
  // A fixed, non-random generator for correctness assertions — the reveal
  // logic itself should be deterministic and testable independent of the
  // default random-scramble glyph (see the dedicated describe block below).
  const staticPlaceholder = () => REDACTED_CHAR;

  it("covers every letter with the placeholder glyph (not a dash/underline) when revealCount is 0", () => {
    const result = revealedNeighborName(name, order, 0, staticPlaceholder);
    expect(result).not.toContain("_");
    const letterCount = name.replace(/[^A-Za-z]/g, "").length;
    expect(result.split("").filter((c) => c === REDACTED_CHAR).length).toBe(letterCount);
  });

  it("reveals exactly revealCount letters, matching the fixed order", () => {
    const result = revealedNeighborName(name, order, 3, staticPlaceholder);
    const revealedChars = result.match(/[A-Za-z]/g) ?? [];
    expect(revealedChars.length).toBe(3);
  });

  it("reveals the full name once revealCount reaches the order length, in its original case", () => {
    const result = revealedNeighborName(name, order, order.length, staticPlaceholder);
    expect(result).toBe(name);
  });

  it("joins letters with no extra spacing — reads as normal words, only the name's own spaces create word breaks", () => {
    const result = revealedNeighborName(name, order, order.length, staticPlaceholder);
    expect(result).toBe("Costa Rica");
    expect(result).not.toContain("  ");
  });

  it("is monotonic — previously revealed letters stay revealed as revealCount grows", () => {
    const at2 = revealedNeighborName(name, order, 2, staticPlaceholder);
    const at5 = revealedNeighborName(name, order, 5, staticPlaceholder);
    for (let i = 0; i < name.length; i++) {
      if (at2[i] !== REDACTED_CHAR && /[A-Za-z]/.test(at2[i])) {
        expect(at5[i]).toBe(at2[i]);
      }
    }
  });

  it("clamps revealCount to the valid range", () => {
    expect(revealedNeighborName(name, order, -5, staticPlaceholder)).toBe(
      revealedNeighborName(name, order, 0, staticPlaceholder),
    );
    expect(revealedNeighborName(name, order, 999, staticPlaceholder)).toBe(
      revealedNeighborName(name, order, order.length, staticPlaceholder),
    );
  });

  it("defaults to a random-letter scramble for unrevealed positions when no generator is passed", () => {
    const result = revealedNeighborName(name, order, 0);
    const letters = result.replace(/[^A-Za-z]/g, "");
    expect(letters.length).toBe(name.replace(/[^A-Za-z]/g, "").length);
    expect(letters).toMatch(/^[A-Z]+$/);
  });

  it("re-scrambles unrevealed positions on each call by default (the slot-machine effect)", () => {
    const results = new Set(Array.from({ length: 20 }, () => revealedNeighborName(name, order, 0)));
    expect(results.size).toBeGreaterThan(1);
  });
});

describe("randomLetter", () => {
  it("always returns a single uppercase A-Z character", () => {
    for (let i = 0; i < 50; i++) {
      expect(randomLetter()).toMatch(/^[A-Z]$/);
    }
  });
});

describe("revealedNeighborChars", () => {
  const name = "Costa Rica";
  const order = shuffleLetterPositions(name);
  const staticPlaceholder = () => REDACTED_CHAR;

  it("marks every letter position as unrevealed when revealCount is 0", () => {
    const chars = revealedNeighborChars(name, order, 0, staticPlaceholder);
    const letterEntries = chars.filter((_c, i) => /[A-Za-z]/.test(name[i]));
    expect(letterEntries.every((c) => c.revealed === false)).toBe(true);
  });

  it("marks non-letter characters (spaces) as revealed even when nothing has been guessed yet", () => {
    const chars = revealedNeighborChars(name, order, 0, staticPlaceholder);
    const spaceIndex = name.indexOf(" ");
    expect(chars[spaceIndex]).toEqual({ char: " ", revealed: true });
  });

  it("marks exactly revealCount letter positions as revealed, matching the fixed order", () => {
    const chars = revealedNeighborChars(name, order, 3, staticPlaceholder);
    const revealedLetters = chars.filter((c) => /[A-Za-z]/.test(c.char) && c.revealed);
    expect(revealedLetters.length).toBe(3);
  });

  it("joining the chars reproduces revealedNeighborName's output", () => {
    const chars = revealedNeighborChars(name, order, 4, staticPlaceholder);
    const joined = chars.map((c) => c.char).join("");
    expect(joined).toBe(revealedNeighborName(name, order, 4, staticPlaceholder));
  });
});
