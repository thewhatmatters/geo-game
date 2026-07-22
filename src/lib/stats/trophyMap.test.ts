import { describe, expect, it } from "vitest";
import {
  buildTrophyMap,
  progressLabel,
  trophySummary,
  type TrophyCountry,
} from "./trophyMap";
import type { Country, CountryCode } from "../game/dailyCountry";
import type { TrophyMapEntry } from "../storage/outcomes";

function country(name: string, path = `M0 0 L400 400 Z`): Country {
  return {
    name,
    fun_fact: "",
    flag: "",
    path,
    centroid: { lat: 0, lng: 0 },
    neighbor_codes: [],
    unique_letters: 4,
    is_island: false,
  };
}

const COUNTRIES: Record<CountryCode, Country> = {
  ISL: country("Iceland"),
  PER: country("Peru"),
  TUV: country("Tuvalu"),
  // Sub-pixel at whole-world scale — stands in for Luxembourg/Singapore.
  MCO: country("Monaco", "M2000 900 L2004 904 Z"),
};

const TROPHIES: Record<string, TrophyMapEntry> = {
  ISL: { tier: "in_time", date: "2026-07-21" },
  PER: { tier: "late", date: "2026-07-20" },
};

function byCode(codes: TrophyCountry[], code: string): TrophyCountry {
  const found = codes.find((entry) => entry.code === code);
  expect(found, `no entry for ${code}`).toBeDefined();
  return found!;
}

describe("buildTrophyMap", () => {
  it("marks every country unsolved when nothing has been won", () => {
    const model = buildTrophyMap(COUNTRIES, {});
    expect(model.countries).toHaveLength(4);
    expect(model.countries.every((entry) => entry.state === "unsolved")).toBe(true);
    expect(model.countries.every((entry) => entry.date === null)).toBe(true);
    expect(model.solved).toBe(0);
    expect(model.inTime).toBe(0);
    expect(model.late).toBe(0);
    expect(model.total).toBe(4);
  });

  it("tiers an in-time solve and a late solve apart, leaving the rest neutral", () => {
    const model = buildTrophyMap(COUNTRIES, TROPHIES);
    expect(byCode(model.countries, "ISL").state).toBe("in_time");
    expect(byCode(model.countries, "PER").state).toBe("late");
    expect(byCode(model.countries, "TUV").state).toBe("unsolved");
    expect(model.inTime).toBe(1);
    expect(model.late).toBe(1);
    expect(model.solved).toBe(2);
  });

  it("carries the solve date and the dataset's name and path through", () => {
    const model = buildTrophyMap(COUNTRIES, TROPHIES);
    const iceland = byCode(model.countries, "ISL");
    expect(iceland.date).toBe("2026-07-21");
    expect(iceland.name).toBe("Iceland");
    expect(iceland.path).toBe(COUNTRIES.ISL.path);
    expect(byCode(model.countries, "TUV").date).toBeNull();
  });

  it("paints unsolved countries first so a fill is never overdrawn", () => {
    const states = buildTrophyMap(COUNTRIES, TROPHIES).countries.map((entry) => entry.state);
    const firstSolved = states.findIndex((state) => state !== "unsolved");
    expect(firstSolved).toBe(2);
    expect(states.slice(firstSolved).includes("unsolved")).toBe(false);
  });

  it("gives a solved micro-country a locator dot, and nothing else one", () => {
    const model = buildTrophyMap(COUNTRIES, { ...TROPHIES, MCO: { tier: "in_time", date: "2026-07-19" } });
    expect(byCode(model.countries, "MCO").marker).toEqual({ x: 2002, y: 902 });
    // Big enough to see: no dot, even when solved.
    expect(byCode(model.countries, "ISL").marker).toBeNull();
    // Unsolved micro-countries stay part of the neutral base map.
    expect(byCode(buildTrophyMap(COUNTRIES, {}).countries, "MCO").marker).toBeNull();
  });

  it("ignores trophies for countries missing from the dataset", () => {
    const model = buildTrophyMap(COUNTRIES, {
      ...TROPHIES,
      XXX: { tier: "in_time", date: "2026-01-01" },
    });
    expect(model.countries).toHaveLength(4);
    expect(model.solved).toBe(2);
  });
});

describe("trophySummary", () => {
  it("names the country, its solve date and its tier", () => {
    const model = buildTrophyMap(COUNTRIES, TROPHIES);
    expect(trophySummary(byCode(model.countries, "ISL"))).toBe(
      "Iceland · 2026-07-21 · Solved in time",
    );
    expect(trophySummary(byCode(model.countries, "PER"))).toBe(
      "Peru · 2026-07-20 · Solved late",
    );
  });

  it("omits the date for a country never solved", () => {
    const model = buildTrophyMap(COUNTRIES, TROPHIES);
    expect(trophySummary(byCode(model.countries, "TUV"))).toBe("Tuvalu · Not yet solved");
  });
});

describe("progressLabel", () => {
  it("reads solved over dataset size", () => {
    expect(progressLabel(buildTrophyMap(COUNTRIES, {}))).toBe("0/4");
    expect(progressLabel(buildTrophyMap(COUNTRIES, TROPHIES))).toBe("2/4");
  });
});
