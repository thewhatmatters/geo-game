import { describe, expect, it } from "vitest";
import { layoutLabels } from "./labelLayout";

const FRAME = { minX: 0, minY: 0, maxX: 200, maxY: 200 };
const FONT_SIZE = 10;

describe("layoutLabels", () => {
  it("leaves well-separated labels untouched", () => {
    const candidates = [
      { code: "A", text: "ALPHA", x: 20, y: 20 },
      { code: "B", text: "BETA", x: 180, y: 180 },
    ];
    const result = layoutLabels(candidates, FRAME, FONT_SIZE);
    expect(result).toEqual(candidates);
  });

  it("nudges the second label apart when two candidates land at (nearly) the same position", () => {
    const candidates = [
      { code: "A", text: "ARGENTINA", x: 100, y: 100 },
      { code: "B", text: "BRAZIL", x: 100, y: 100 },
    ];
    const result = layoutLabels(candidates, FRAME, FONT_SIZE);
    expect(result[0]).toEqual(candidates[0]); // first placed label is never moved
    expect(result[1].y).not.toBe(candidates[1].y);
    // resolved apart by at least one line height
    expect(Math.abs(result[1].y - result[0].y)).toBeGreaterThanOrEqual(FONT_SIZE * 1.3 - 0.001);
  });

  it("keeps nudged labels within the frame bounds", () => {
    // Force the collision near the very bottom edge, where nudging "down"
    // would otherwise push the label outside the frame.
    const candidates = [
      { code: "A", text: "ARGENTINA", x: 100, y: 195 },
      { code: "B", text: "BRAZIL", x: 100, y: 195 },
    ];
    const result = layoutLabels(candidates, FRAME, FONT_SIZE);
    for (const label of result) {
      expect(label.y).toBeGreaterThanOrEqual(FRAME.minY);
      expect(label.y).toBeLessThanOrEqual(FRAME.maxY);
    }
  });

  it("does not nudge labels that are vertically separated even if horizontally aligned", () => {
    const candidates = [
      { code: "A", text: "ALPHA", x: 100, y: 20 },
      { code: "B", text: "BETA", x: 100, y: 180 },
    ];
    const result = layoutLabels(candidates, FRAME, FONT_SIZE);
    expect(result).toEqual(candidates);
  });

  it("handles three overlapping candidates without throwing", () => {
    const candidates = [
      { code: "A", text: "ARGENTINA", x: 100, y: 100 },
      { code: "B", text: "BRAZIL", x: 100, y: 100 },
      { code: "C", text: "CHILE", x: 100, y: 100 },
    ];
    expect(() => layoutLabels(candidates, FRAME, FONT_SIZE)).not.toThrow();
    const result = layoutLabels(candidates, FRAME, FONT_SIZE);
    expect(result).toHaveLength(3);
  });
});
