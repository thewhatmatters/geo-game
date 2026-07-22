import { afterEach, describe, expect, it, vi } from "vitest";
import { motionDuration, prefersReducedMotion } from "./motion";

describe("prefersReducedMotion / motionDuration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false when matchMedia is unavailable", () => {
    vi.stubGlobal("window", { matchMedia: undefined });
    expect(prefersReducedMotion()).toBe(false);
  });

  it("reads the prefers-reduced-motion media query", () => {
    const matchMedia = vi.fn((query: string) => ({
      matches: query.includes("prefers-reduced-motion: reduce"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal("window", { matchMedia });
    expect(prefersReducedMotion()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
  });

  it("zeros motion durations when reduced motion is requested", () => {
    expect(motionDuration(0.42, true)).toBe(0);
    expect(motionDuration(0.42, false)).toBe(0.42);
    expect(motionDuration(1.4, null)).toBe(1.4);
  });
});
