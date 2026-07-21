import { describe, expect, it } from "vitest";
import { bootRound, resolveBootDate } from "./boot";
import { getDailyCountry } from "./dailyCountry";
import { getDayNumber } from "../share";

const FROZEN_DATE = new Date("2026-03-15T12:00:00Z");

describe("bootRound", () => {
  it("resolves the same daily selection as getDailyCountry for the same date", () => {
    const boot = bootRound(FROZEN_DATE, { width: 800, height: 600 });
    const expected = getDailyCountry(boot.date);
    expect(boot.daily.targetCode).toBe(expected.targetCode);
    expect(boot.daily.neighborCodes).toEqual(expected.neighborCodes);
  });

  it("is deterministic: same date + viewport → identical boot", () => {
    const a = bootRound(FROZEN_DATE, { width: 1280, height: 800 });
    const b = bootRound(new Date(FROZEN_DATE), { width: 1280, height: 800 });
    expect(a.daily.targetCode).toBe(b.daily.targetCode);
    expect(a.scene.viewBox).toBe(b.scene.viewBox);
    expect(a.dayNumber).toBe(b.dayNumber);
  });

  it("passes the LARGER viewport dimension to the scene (cover behavior)", () => {
    // pxScale = viewBoxSize / renderPx, so for the same date (same viewBox)
    // a landscape and a portrait viewport with the same max dimension must
    // produce the same pxScale — and a larger max must shrink it.
    const landscape = bootRound(FROZEN_DATE, { width: 1000, height: 400 });
    const portrait = bootRound(FROZEN_DATE, { width: 400, height: 1000 });
    expect(landscape.scene.pxScale).toBe(portrait.scene.pxScale);

    const bigger = bootRound(FROZEN_DATE, { width: 2000, height: 400 });
    expect(bigger.scene.pxScale).toBeLessThan(landscape.scene.pxScale);
  });

  it("carries one resolved local date through every date-keyed subsystem", () => {
    const boot = bootRound(FROZEN_DATE, { width: 800, height: 600 });
    expect(boot.date).toBe(resolveBootDate(FROZEN_DATE));
    expect(boot.daily.date).toBe(boot.date);
    expect(boot.dayNumber).toBe(getDayNumber(boot.date));
  });

  it("gives a valid ?date= override precedence over the device local date", () => {
    const boot = bootRound(FROZEN_DATE, { width: 800, height: 600 }, "2030-02-03");
    expect(boot.date).toBe("2030-02-03");
    expect(boot.daily).toEqual(getDailyCountry("2030-02-03"));
  });

  it("rejects impossible overrides and falls back to the local date", () => {
    expect(resolveBootDate(FROZEN_DATE, "2026-02-30")).toBe(resolveBootDate(FROZEN_DATE));
  });
});
