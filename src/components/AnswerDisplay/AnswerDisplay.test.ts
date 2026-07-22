import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AnswerDisplay, answerSize } from "./AnswerDisplay";
import type { DisplayChar } from "../../lib/game/useGameRound";

/** "CHAD" → one word of four unrevealed slots. */
function word(text: string, revealed = false): DisplayChar[] {
  return text.split("").map((char) => ({ char, revealed, isLetter: /[A-Z]/i.test(char) }));
}

function words(name: string, revealed = false): DisplayChar[][] {
  return name.split(" ").map((w) => word(w, revealed));
}

describe("answerSize", () => {
  it("keeps ordinary names at full size", () => {
    expect(answerSize(words("CHAD"))).toBe("md");
    expect(answerSize(words("PERU"))).toBe("md");
    expect(answerSize(words("SRI LANKA"))).toBe("md");
  });

  it("steps down for a long name", () => {
    expect(answerSize(words("WALLIS AND FUTUNA"))).toBe("sm");
  });

  it("steps down twice for the dataset's extremes", () => {
    expect(answerSize(words("SOUTH GEORGIA AND THE SOUTH SANDWICH ISLANDS"))).toBe("xs");
    expect(answerSize(words("DEMOCRATIC REPUBLIC OF THE CONGO"))).toBe("xs");
  });

  it("steps down on a single unwrappable long word, not just the total", () => {
    // 13 letters in one word — under the total threshold, over the word one.
    expect(answerSize(words("LIECHTENSTEIN"))).toBe("sm");
  });
});

describe("AnswerDisplay", () => {
  it("publishes the size bucket the stylesheet scales the slots from", () => {
    const html = renderToStaticMarkup(
      createElement(AnswerDisplay, { words: words("CHAD"), guesses: {} }),
    );
    expect(html).toContain('data-size="md"');

    const long = renderToStaticMarkup(
      createElement(AnswerDisplay, {
        words: words("SOUTH GEORGIA AND THE SOUTH SANDWICH ISLANDS"),
        guesses: {},
      }),
    );
    expect(long).toContain('data-size="xs"');
  });

  it("reads the blanks out as text, with revealed letters in place", () => {
    const mixed = [word("CH", true), word("AD")];
    const html = renderToStaticMarkup(
      createElement(AnswerDisplay, { words: mixed, guesses: {} }),
    );

    expect(html).toContain('aria-label="Answer: CH __"');
    expect(html).toContain('role="status"');
  });
});
