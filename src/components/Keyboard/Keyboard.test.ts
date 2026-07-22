import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Keyboard, isForeignKeystroke } from "./Keyboard";

/** Minimal stand-in for the parts of a KeyboardEvent the guard reads. */
function keyEvent(
  key: string,
  options: {
    metaKey?: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
    target?: { tagName: string; isContentEditable?: boolean } | null;
  } = {},
): KeyboardEvent {
  return {
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    target: { tagName: "BODY", isContentEditable: false },
    ...options,
  } as unknown as KeyboardEvent;
}

describe("isForeignKeystroke", () => {
  it("lets a bare letter through as a guess", () => {
    expect(isForeignKeystroke(keyEvent("a"))).toBe(false);
  });

  it("ignores shortcut chords, so ⌘R reloads instead of guessing R", () => {
    expect(isForeignKeystroke(keyEvent("r", { metaKey: true }))).toBe(true);
    expect(isForeignKeystroke(keyEvent("f", { ctrlKey: true }))).toBe(true);
    expect(isForeignKeystroke(keyEvent("e", { altKey: true }))).toBe(true);
  });

  it("ignores typing inside a text field (the save-code box)", () => {
    expect(isForeignKeystroke(keyEvent("g", { target: { tagName: "TEXTAREA" } }))).toBe(true);
    expect(isForeignKeystroke(keyEvent("g", { target: { tagName: "INPUT" } }))).toBe(true);
    expect(
      isForeignKeystroke(keyEvent("g", { target: { tagName: "DIV", isContentEditable: true } })),
    ).toBe(true);
  });

  it("survives an event with no target", () => {
    expect(isForeignKeystroke(keyEvent("g", { target: null }))).toBe(false);
  });
});

describe("Keyboard accessibility", () => {
  it("labels each key with its guessed state, not color alone", () => {
    const html = renderToStaticMarkup(
      createElement(Keyboard, {
        guesses: { A: "correct", B: "wrong" } as Record<string, "correct" | "wrong">,
        onGuess: () => {},
      }),
    );

    expect(html).toContain('aria-label="A, correct"');
    expect(html).toContain('aria-label="B, wrong"');
    expect(html).toContain('aria-label="Guess C"');
    expect(html).toContain('aria-label="Letter keyboard"');
  });
});
