import { describe, expect, it } from "vitest";
import countriesData from "../../data/countries.json";
import type { Country } from "../game/dailyCountry";
import { computeGeoScene, SCENE_RENDER_PX } from "./scene";

const countries = countriesData as Record<string, Country>;

function findTargetWithNeighbors(): Country {
  return Object.values(countries).find((c) => !c.is_island && c.neighbor_codes.length > 0)!;
}

describe("computeGeoScene", () => {
  it("returns a viewBox and a positive pxScale for a country with real neighbors", () => {
    const target = findTargetWithNeighbors();
    const scene = computeGeoScene({ target, neighborCodes: target.neighbor_codes.slice(0, 3) });

    expect(scene.viewBox).toMatch(/^-?\d+(\.\d+)? -?\d+(\.\d+)? \d+(\.\d+)? \d+(\.\d+)?$/);
    expect(scene.pxScale).toBeGreaterThan(0);
    expect(scene.neighbors).toHaveLength(Math.min(3, target.neighbor_codes.length));
  });

  it("resolves each neighbor's own country data and bounds", () => {
    const target = findTargetWithNeighbors();
    const scene = computeGeoScene({ target, neighborCodes: target.neighbor_codes.slice(0, 3) });

    for (const slot of scene.neighbors) {
      expect(slot.country.name).toBe(countries[slot.code].name);
      expect(slot.bounds.maxX).toBeGreaterThan(slot.bounds.minX);
      expect(slot.bounds.maxY).toBeGreaterThan(slot.bounds.minY);
    }
  });

  it("returns no neighbors for an island (0 neighbor codes) without error", () => {
    const island = Object.values(countries).find((c) => c.is_island)!;
    expect(() => computeGeoScene({ target: island, neighborCodes: [] })).not.toThrow();
    expect(computeGeoScene({ target: island, neighborCodes: [] }).neighbors).toEqual([]);
  });

  it("places a real neighbor's bounds close to the target's (shared coordinate frame, not independently normalized)", () => {
    // Paraguay/Brazil are real, confirmed-adjacent countries in the dataset.
    // In a shared projection their bounding boxes should be near each
    // other — not arbitrarily far apart the way two independently
    // fit-to-box paths would be.
    const target = countries["PRY"];
    const scene = computeGeoScene({ target, neighborCodes: ["BRA"] });
    const brazil = scene.neighbors.find((n) => n.code === "BRA")!;

    const [viewBoxMinX, viewBoxMinY, viewBoxWidth] = scene.viewBox.split(" ").map(Number);
    const cx = viewBoxMinX + viewBoxWidth / 2;
    const cy = viewBoxMinY + viewBoxWidth / 2;

    const distance = Math.hypot(brazil.bounds.minX - cx, brazil.bounds.minY - cy);
    expect(distance).toBeLessThan(viewBoxWidth * 10);
  });

  it("SCENE_RENDER_PX is a positive pixel size used to derive pxScale", () => {
    expect(SCENE_RENDER_PX).toBeGreaterThan(0);
  });

  it("clips a large neighbor's visibleBounds to the viewBox, even though its true bounds extend far outside it", () => {
    // Brazil's true bounding box is much larger than Paraguay's viewBox —
    // visibleBounds must be clamped to what's actually on screen, so a
    // label centered on it doesn't land off-screen (the bug this fixes).
    const target = countries["PRY"];
    const scene = computeGeoScene({ target, neighborCodes: ["BRA"] });
    const brazil = scene.neighbors.find((n) => n.code === "BRA")!;
    const viewBoxBounds = scene.viewBox.split(" ").map(Number);
    const [vbMinX, vbMinY, vbWidth, vbHeight] = viewBoxBounds;

    expect(brazil.visibleBounds).not.toBeNull();
    expect(brazil.visibleBounds!.minX).toBeGreaterThanOrEqual(vbMinX);
    expect(brazil.visibleBounds!.maxX).toBeLessThanOrEqual(vbMinX + vbWidth);
    expect(brazil.visibleBounds!.minY).toBeGreaterThanOrEqual(vbMinY);
    expect(brazil.visibleBounds!.maxY).toBeLessThanOrEqual(vbMinY + vbHeight);
  });

  it("clips a neighbor whose true bounds genuinely exceed the viewBox (tiny enclave target, large neighbor)", () => {
    // Lesotho is a small country entirely enclosed by South Africa, which
    // is far larger than any reasonable viewBox margin around it — a
    // realistic case where the true bounds truly can't fit.
    const target = countries["LSO"];
    const scene = computeGeoScene({ target, neighborCodes: ["ZAF"] });
    const southAfrica = scene.neighbors.find((n) => n.code === "ZAF")!;
    const [, , vbWidth, vbHeight] = scene.viewBox.split(" ").map(Number);

    const trueWidth = southAfrica.bounds.maxX - southAfrica.bounds.minX;
    const trueHeight = southAfrica.bounds.maxY - southAfrica.bounds.minY;
    expect(trueWidth > vbWidth || trueHeight > vbHeight).toBe(true);

    // Still clipped correctly to the frame despite that.
    expect(southAfrica.visibleBounds).not.toBeNull();
    const [vbMinX, vbMinY] = scene.viewBox.split(" ").map(Number);
    expect(southAfrica.visibleBounds!.minX).toBeGreaterThanOrEqual(vbMinX);
    expect(southAfrica.visibleBounds!.minY).toBeGreaterThanOrEqual(vbMinY);
  });

  it("returns null visibleBounds for a neighbor that doesn't intersect the viewBox at all", () => {
    // Australia is nowhere near Paraguay in the shared frame — passing it
    // in as if it were a "neighbor" exercises the no-overlap case directly.
    const target = countries["PRY"];
    const scene = computeGeoScene({ target, neighborCodes: ["AUS"] });
    const australia = scene.neighbors.find((n) => n.code === "AUS");
    expect(australia?.visibleBounds).toBeNull();
  });
});
