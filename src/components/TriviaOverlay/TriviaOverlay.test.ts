import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  FUN_FACT_REVEAL_AFTER_SECONDS,
  TriviaOverlay,
} from "./TriviaOverlay";
import { getCountry } from "../../lib/game/dailyCountry";

/** Real country code known to have both trivia + fun_fact in the shipped dataset. */
const CODE_WITH_FACT = "ISL";

describe("TriviaOverlay", () => {
  it("exports start-visible reveal timing by default", () => {
    expect(FUN_FACT_REVEAL_AFTER_SECONDS).toBe(0);
  });

  it("renders the fun_fact line beneath the trivia question", () => {
    const funFact = getCountry(CODE_WITH_FACT).fun_fact;
    expect(funFact.trim().length).toBeGreaterThan(0);

    const html = renderToStaticMarkup(
      createElement(TriviaOverlay, { code: CODE_WITH_FACT, elapsedSeconds: 0 }),
    );

    expect(html).toContain('data-testid="trivia-overlay"');
    expect(html).toContain('data-testid="trivia-question"');
    expect(html).toContain('data-testid="trivia-fun-fact"');
    expect(html).toContain(funFact);
    // Fun fact appears after the question in markup.
    const qIdx = html.indexOf('data-testid="trivia-question"');
    const fIdx = html.indexOf('data-testid="trivia-fun-fact"');
    expect(qIdx).toBeGreaterThanOrEqual(0);
    expect(fIdx).toBeGreaterThan(qIdx);
  });

  it("renders nothing for an empty fun_fact (no empty container)", () => {
    // Unknown code: no trivia row and no country record → full null render.
    const html = renderToStaticMarkup(
      createElement(TriviaOverlay, { code: "ZZZ_MISSING", elapsedSeconds: 0 }),
    );
    expect(html).toBe("");
  });

  it("omits the fun-fact element when reveal timing has not elapsed", () => {
    const html = renderToStaticMarkup(
      createElement(TriviaOverlay, {
        code: CODE_WITH_FACT,
        elapsedSeconds: 5,
        revealAfterSeconds: 30,
      }),
    );
    expect(html).toContain('data-testid="trivia-question"');
    expect(html).not.toContain('data-testid="trivia-fun-fact"');
    expect(html).not.toContain('class="trivia-overlay__fun-fact"');
  });

  it("shows the fun fact once elapsed reaches the reveal threshold", () => {
    const funFact = getCountry(CODE_WITH_FACT).fun_fact;
    const html = renderToStaticMarkup(
      createElement(TriviaOverlay, {
        code: CODE_WITH_FACT,
        elapsedSeconds: 30,
        revealAfterSeconds: 30,
      }),
    );
    expect(html).toContain('data-testid="trivia-fun-fact"');
    expect(html).toContain(funFact);
  });
});
