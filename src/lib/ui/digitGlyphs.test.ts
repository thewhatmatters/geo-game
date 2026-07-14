import { describe, expect, it } from "vitest";
import { DIGIT_GLYPHS } from "./digitGlyphs";

describe("DIGIT_GLYPHS", () => {
  it("has an entry for every digit 0-9", () => {
    for (let d = 0; d <= 9; d++) {
      expect(DIGIT_GLYPHS[String(d)]).toBeDefined();
    }
  });

  it("is a 5-wide x 7-tall grid of only 0/1 characters for every digit", () => {
    for (const glyph of Object.values(DIGIT_GLYPHS)) {
      expect(glyph).toHaveLength(7);
      for (const row of glyph) {
        expect(row).toHaveLength(5);
        expect(row).toMatch(/^[01]{5}$/);
      }
    }
  });
});
