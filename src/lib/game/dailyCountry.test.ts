import { describe, expect, it } from "vitest";
import countriesData from "../../data/countries.json";
import { getDailyCountry, selectNeighborSubset, type Country } from "./dailyCountry";

const countries = countriesData as Record<string, Country>;

describe("getDailyCountry", () => {
  it("is deterministic for repeated calls with the same date", () => {
    const date = new Date("2026-07-11T00:00:00.000Z");
    const first = getDailyCountry(date);
    const second = getDailyCountry(date);
    expect(second).toEqual(first);
  });

  it("is deterministic across different times on the same UTC date", () => {
    const morning = getDailyCountry(new Date("2026-07-11T01:00:00.000Z"));
    const night = getDailyCountry(new Date("2026-07-11T23:59:59.999Z"));
    expect(night.targetCode).toBe(morning.targetCode);
    expect(night.neighborCodes).toEqual(morning.neighborCodes);
  });

  it("picks a target country that exists in the dataset", () => {
    const { targetCode, target } = getDailyCountry(new Date("2026-07-11T00:00:00.000Z"));
    expect(countries[targetCode]).toBe(target);
  });

  it("never selects more than 3 neighbors", () => {
    // Sample a spread of dates rather than just one, since neighbor count
    // depends on which country the hash lands on.
    const dates = [
      "2026-01-01T00:00:00.000Z",
      "2026-03-15T00:00:00.000Z",
      "2026-07-11T00:00:00.000Z",
      "2026-11-30T00:00:00.000Z",
    ];
    for (const iso of dates) {
      const { neighborCodes } = getDailyCountry(new Date(iso));
      expect(neighborCodes.length).toBeLessThanOrEqual(3);
    }
  });

  it("returns an empty neighbor list without error for a real island country", () => {
    const [islandCode, islandCountry] = Object.entries(countries).find(([, c]) => c.is_island)!;
    expect(islandCountry.neighbor_codes).toEqual([]);
    expect(() => selectNeighborSubset("2026-07-11", islandCode, islandCountry)).not.toThrow();
    expect(selectNeighborSubset("2026-07-11", islandCode, islandCountry)).toEqual([]);
  });
});

describe("selectNeighborSubset", () => {
  it("returns the full neighbor list when there are 3 or fewer", () => {
    const result = selectNeighborSubset("2026-07-11", "TST", { neighbor_codes: ["AAA", "BBB"] });
    expect(result).toEqual(["AAA", "BBB"]);
  });

  it("returns an empty list without error when there are 0 neighbors", () => {
    expect(() => selectNeighborSubset("2026-07-11", "TST", { neighbor_codes: [] })).not.toThrow();
    expect(selectNeighborSubset("2026-07-11", "TST", { neighbor_codes: [] })).toEqual([]);
  });

  it("deterministically picks exactly 3 of N neighbors, same result every call", () => {
    const manyNeighbors = { neighbor_codes: ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF"] };
    const first = selectNeighborSubset("2026-07-11", "TST", manyNeighbors);
    const second = selectNeighborSubset("2026-07-11", "TST", manyNeighbors);
    expect(first).toHaveLength(3);
    expect(second).toEqual(first);
    for (const code of first) {
      expect(manyNeighbors.neighbor_codes).toContain(code);
    }
  });

  it("picks a different subset on a different date (seeded, not static)", () => {
    const manyNeighbors = { neighbor_codes: ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF"] };
    const day1 = selectNeighborSubset("2026-07-11", "TST", manyNeighbors);
    const day2 = selectNeighborSubset("2026-11-30", "TST", manyNeighbors);
    expect(day1).not.toEqual(day2);
  });
});
