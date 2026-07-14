import { DIGIT_GLYPHS } from "../../lib/ui/digitGlyphs";

export interface DotMatrixNumberProps {
  /** Rendered zero-padded to `minDigits` — negative values clamp to 0. */
  value: number;
  minDigits?: number;
}

/** Arcade-scoreboard-style dot-matrix readout — each digit is a 5x7 grid of lit/unlit dots (see digitGlyphs.ts), not plain text. */
export function DotMatrixNumber({ value, minDigits = 2 }: DotMatrixNumberProps) {
  const digits = String(Math.max(0, value)).padStart(minDigits, "0").split("");

  return (
    <div className="dot-matrix" data-testid="dot-matrix">
      {digits.map((digit, digitIndex) => {
        const glyph = DIGIT_GLYPHS[digit] ?? DIGIT_GLYPHS["0"];
        return (
          <div className="dot-matrix__digit" key={digitIndex}>
            {glyph.map((row, rowIndex) =>
              row.split("").map((cell, colIndex) => (
                <span
                  key={`${rowIndex}-${colIndex}`}
                  className={`dot-matrix__dot${cell === "1" ? " dot-matrix__dot--lit" : ""}`}
                />
              )),
            )}
          </div>
        );
      })}
    </div>
  );
}
