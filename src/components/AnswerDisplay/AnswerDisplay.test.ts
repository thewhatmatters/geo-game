import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AnswerDisplay } from "./AnswerDisplay";
import type { DisplayChar } from "../../lib/game/useGameRound";

function word(letters: string, revealed = false): DisplayChar[] {
  return letters.split("").map((char) => ({
    char,
    revealed,
    isLetter: /[a-zA-Z]/.test(char),
  }));
}

describe("AnswerDisplay density", () => {
  it("uses sm density for short names", () => {
    const html = renderToStaticMarkup(
      createElement(AnswerDisplay, {
        words: [word("ICELAND")],
        guesses: {},
        nameLength: 7,
      }),
    );
    expect(html).toContain("display-name--sm");
    expect(html).toContain('data-testid="display-name"');
  });

  it("steps density for very long country names", () => {
    const long = "South Georgia and the South Sandwich Islands";
    const letters = long.replace(/[^a-zA-Z]/g, "");
    const html = renderToStaticMarkup(
      createElement(AnswerDisplay, {
        words: long.split(" ").map((w) => word(w)),
        guesses: {},
        nameLength: letters.length,
      }),
    );
    expect(html).toContain("display-name--xl");
  });

  it("keeps cell structure stable whether letters are revealed or not", () => {
    const blank = renderToStaticMarkup(
      createElement(AnswerDisplay, {
        words: [word("PERU", false)],
        guesses: {},
        nameLength: 4,
      }),
    );
    const filled = renderToStaticMarkup(
      createElement(AnswerDisplay, {
        words: [word("PERU", true)],
        guesses: { P: "correct", E: "correct", R: "correct", U: "correct" },
        nameLength: 4,
      }),
    );
    // Same number of cell containers either way — letter mount doesn't add/remove cells.
    const blankCells = (blank.match(/display-name__cell/g) ?? []).length;
    const filledCells = (filled.match(/display-name__cell/g) ?? []).length;
    expect(blankCells).toBe(4);
    expect(filledCells).toBe(4);
  });
});
