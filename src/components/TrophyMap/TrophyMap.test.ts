import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TrophyMap } from "./TrophyMap";
import type { Country, CountryCode } from "../../lib/game/dailyCountry";
import type { TrophyMapEntry } from "../../lib/storage/outcomes";

function country(name: string, path = "M0 0 L400 400 Z"): Country {
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

function render(
  trophyMap: Record<string, TrophyMapEntry>,
  extra: { highlightCode?: string | null } = {},
): string {
  return renderToStaticMarkup(
    createElement(TrophyMap, { countries: COUNTRIES, trophyMap, ...extra }),
  );
}

/** The <g> wrapper plus the shape it holds — one country's whole rendering. */
function shapeFor(html: string, code: string): string {
  const match = html.match(new RegExp(`<g[^>]*data-code="${code}"[^>]*>.*?</g>`));
  expect(match, `no shape rendered for ${code}`).not.toBeNull();
  return match![0];
}

describe("TrophyMap", () => {
  it("renders every country in the dataset, base map included", () => {
    const html = render({});
    expect((html.match(/data-code="/g) ?? []).length).toBe(4);
    expect(html).toContain('data-testid="trophy-map-svg"');
  });

  it("leaves every country neutral when no trophies exist", () => {
    const html = render({});
    for (const code of ["ISL", "PER", "TUV", "MCO"]) {
      expect(shapeFor(html, code)).toContain('data-state="unsolved"');
    }
    // Nothing solved means nothing focusable.
    expect(html).not.toContain('role="button"');
    expect(html).toContain(">0/4<");
  });

  it("tiers an in-time solve, a late solve and an unsolved country apart", () => {
    const html = render(TROPHIES);
    expect(shapeFor(html, "ISL")).toContain('data-state="in_time"');
    expect(shapeFor(html, "PER")).toContain('data-state="late"');
    expect(shapeFor(html, "TUV")).toContain('data-state="unsolved"');
  });

  it("gives every country a tooltip with name, solve date and tier", () => {
    const html = render(TROPHIES);
    expect(html).toContain("<title>Iceland · 2026-07-21 · Solved in time</title>");
    expect(html).toContain("<title>Peru · 2026-07-20 · Solved late</title>");
    expect(html).toContain("<title>Tuvalu · Not yet solved</title>");
    // The same text is the accessible name of the tappable solved shapes.
    expect(shapeFor(html, "ISL")).toContain('aria-label="Iceland · 2026-07-21 · Solved in time"');
  });

  it("makes solved countries tappable and leaves unsolved ones inert", () => {
    const html = render(TROPHIES);
    expect(shapeFor(html, "ISL")).toContain('role="button"');
    expect(shapeFor(html, "PER")).toContain('role="button"');
    expect(shapeFor(html, "TUV")).not.toContain('role="button"');
    expect((html.match(/role="button"/g) ?? []).length).toBe(2);
  });

  it("draws a sub-pixel country as a locator dot instead of its own shape", () => {
    const html = render({ ...TROPHIES, MCO: { tier: "in_time", date: "2026-07-19" } });
    const monaco = shapeFor(html, "MCO");
    expect(monaco).toContain("<circle");
    expect(monaco).toContain('cx="2002"');
    expect(monaco).toContain("trophy-map__marker");
    // The dot is what a player can hover or tap.
    expect(monaco).toContain('role="button"');
    expect(monaco).toContain("<title>Monaco · 2026-07-19 · Solved in time</title>");
    // A normal-sized country still draws its real outline.
    expect(shapeFor(html, "ISL")).toContain("<path");
    expect(shapeFor(html, "ISL")).not.toContain("<circle");
  });

  it("never dots an unsolved micro-country — only trophies get the aid", () => {
    expect(render(TROPHIES)).not.toContain("<circle");
  });

  it("counts progress as solved over dataset size", () => {
    expect(render(TROPHIES)).toContain(">2/4<");
    expect(render(TROPHIES)).toContain("COUNTRIES CLAIMED");
  });

  it("marks today's solve for the fill animation, and only that one", () => {
    const html = render(TROPHIES, { highlightCode: "ISL" });
    expect(shapeFor(html, "ISL")).toContain('data-new="true"');
    expect(shapeFor(html, "ISL")).toContain("trophy-map__country--new");
    expect(shapeFor(html, "PER")).not.toContain("trophy-map__country--new");
  });

  it("never animates a country that isn't solved yet", () => {
    const html = render(TROPHIES, { highlightCode: "TUV" });
    expect(html).not.toContain("trophy-map__country--new");
  });

  it("shows the legend by default and hides it on request", () => {
    expect(render(TROPHIES)).toContain('data-testid="trophy-map-legend"');
    const compact = renderToStaticMarkup(
      createElement(TrophyMap, { countries: COUNTRIES, trophyMap: TROPHIES, showLegend: false }),
    );
    expect(compact).not.toContain('data-testid="trophy-map-legend"');
  });
});
