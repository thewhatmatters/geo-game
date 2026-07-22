import { describe, expect, it } from "vitest";
import countriesData from "../../data/countries.json";
import type { Country } from "../game/dailyCountry";
import { computeGeoScene, clusterCenters, clampWorldCenterY, worldExtentY, LOCATOR_RING_MIN_BOOST, SMALL_TARGET_MAX_BOOST, WORLD_HEIGHT } from "./scene";
import { pathBounds, viewBoxSize } from "./pathBounds";

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

  it("drops a neighbor code the dataset has no country for, keeping the rest", () => {
    const target = findTargetWithNeighbors();
    const real = target.neighbor_codes.slice(0, 2);
    const scene = computeGeoScene({ target, neighborCodes: [...real, "ZZZ_MISSING"] });

    expect(scene.neighbors.map((slot) => slot.code)).toEqual(real);
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

  it("accepts an explicit renderPx and scales pxScale accordingly (matches the real viewport, not a stale fixed box)", () => {
    const target = findTargetWithNeighbors();
    const small = computeGeoScene({ target, neighborCodes: [] }, 320);
    const large = computeGeoScene({ target, neighborCodes: [] }, 1440);

    // Same viewBox (renderPx doesn't affect what's shown, only how big a
    // "desired px" constant like stroke-width ends up in user-units).
    expect(small.viewBox).toBe(large.viewBox);
    // A bigger render size means fewer user-units per desired px.
    expect(large.pxScale).toBeLessThan(small.pxScale);
    expect(large.pxScale).toBeCloseTo(small.pxScale * (320 / 1440), 10);
  });

  it("defaults to a positive pxScale when renderPx is omitted (non-browser callers, e.g. tests)", () => {
    const target = findTargetWithNeighbors();
    const scene = computeGeoScene({ target, neighborCodes: [] });
    expect(scene.pxScale).toBeGreaterThan(0);
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

  it("anchors a wrap-around neighbor's visibleBounds on its in-frame geometry, not the degenerate bbox clip (Geo #9 bug)", () => {
    // France wraps around Luxembourg's south and west, so France's raw
    // bounding box CONTAINS Luxembourg's entire viewBox — a bbox clip
    // degenerates to the frame itself, centering the FRANCE label dead-on
    // the target (right where the target's own reveal label renders).
    const scene = computeGeoScene({ target: countries["LUX"], neighborCodes: ["FRA"] });
    const france = scene.neighbors.find((n) => n.code === "FRA")!;
    const [, vbMinY, vbWidth, vbHeight] = scene.viewBox.split(" ").map(Number);

    // The old bug: visibleBounds === the whole frame.
    expect(france.visibleBounds).not.toBeNull();
    const width = france.visibleBounds!.maxX - france.visibleBounds!.minX;
    const height = france.visibleBounds!.maxY - france.visibleBounds!.minY;
    expect(width * height).toBeLessThan(vbWidth * vbHeight * 0.9);

    // France is SOUTH of Luxembourg — its label anchor must sit in the
    // lower half of the frame, not at the frame's center.
    const centerY = (france.visibleBounds!.minY + france.visibleBounds!.maxY) / 2;
    expect(centerY).toBeGreaterThan(vbMinY + vbHeight / 2);
  });

  it("returns null visibleBounds for a neighbor that doesn't intersect the viewBox at all", () => {
    // Australia is nowhere near Paraguay in the shared frame — passing it
    // in as if it were a "neighbor" exercises the no-overlap case directly.
    const target = countries["PRY"];
    const scene = computeGeoScene({ target, neighborCodes: ["AUS"] });
    const australia = scene.neighbors.find((n) => n.code === "AUS");
    expect(australia?.visibleBounds).toBeNull();
  });

  describe("small-target readability boost (targetBoost)", () => {
    /** Larger of the target's bounding-box dimensions, in world units — the size signal the boost keys off. */
    function targetSpan(country: Country): number {
      const b = pathBounds(country.path);
      return Math.max(b.maxX - b.minX, b.maxY - b.minY);
    }
    /** ViewBox size as a multiple of the target's span — smaller means a tighter frame (bigger on-screen target). */
    function frameRatio(country: Country): number {
      const scene = computeGeoScene({ target: country, neighborCodes: [] });
      return viewBoxSize(scene.viewBox) / targetSpan(country);
    }

    it("boosts a tiny scattered island group: targetBoost > 1 and a tighter frame than a large country's", () => {
      // Wallis and Futuna — today's real-world regression case: two tiny
      // islands whose combined bbox is mostly ocean.
      const wlf = countries["WLF"];
      const scene = computeGeoScene({ target: wlf, neighborCodes: [] });
      expect(scene.targetBoost).toBeGreaterThan(1);
      expect(frameRatio(wlf)).toBeLessThan(frameRatio(countries["DEU"]));
      // Frame tightening tracks the boost exactly: margin is divided by it.
      expect(frameRatio(wlf)).toBeCloseTo(1 + (frameRatio(countries["DEU"]) - 1) / scene.targetBoost, 6);
    });

    it("leaves large-country days untouched: boost is exactly 1 and the frame is the standard margin", () => {
      for (const code of ["DEU", "BRA"]) {
        const scene = computeGeoScene({ target: countries[code], neighborCodes: [] });
        expect(scene.targetBoost).toBe(1);
        // Standard frame: 1 + 2 * VIEWBOX_MARGIN_RATIO (2.5) times the span.
        expect(frameRatio(countries[code])).toBeCloseTo(6, 6);
      }
    });

    it("caps the boost for micro-states so the frame/stroke never gets absurd", () => {
      // Vatican City: ~0.1 world units across — an uncapped span-inverse
      // boost would be in the hundreds.
      const scene = computeGeoScene({ target: countries["VAT"], neighborCodes: [] });
      expect(scene.targetBoost).toBe(SMALL_TARGET_MAX_BOOST);
    });
  });

  describe("locator rings (locatorCenters)", () => {
    it("marks each far-apart landmass of a boosted scattered-island target", () => {
      // Wallis and Futuna: two islands ~24 world units apart — each earns
      // its own ring, and each center falls inside its island's own bbox.
      const wlf = countries["WLF"];
      const scene = computeGeoScene({ target: wlf, neighborCodes: [] });
      expect(scene.targetBoost).toBeGreaterThanOrEqual(LOCATOR_RING_MIN_BOOST);
      expect(scene.locatorCenters).toHaveLength(2);

      const targetBounds = pathBounds(wlf.path);
      for (const center of scene.locatorCenters) {
        expect(center.x).toBeGreaterThanOrEqual(targetBounds.minX);
        expect(center.x).toBeLessThanOrEqual(targetBounds.maxX);
        expect(center.y).toBeGreaterThanOrEqual(targetBounds.minY);
        expect(center.y).toBeLessThanOrEqual(targetBounds.maxY);
      }
    });

    it("emits no rings for a boosted but compact single-landmass target (Luxembourg)", () => {
      // Luxembourg is tiny (boost ≥ threshold) but one solid landmass that
      // fills the tightened frame — a ring at its center is noise sitting
      // exactly where the target's own reveal label renders.
      const scene = computeGeoScene({ target: countries["LUX"], neighborCodes: [] });
      expect(scene.targetBoost).toBeGreaterThanOrEqual(LOCATOR_RING_MIN_BOOST);
      expect(scene.locatorCenters).toEqual([]);
    });

    it("emits no rings at all on non-boosted days (large countries)", () => {
      for (const code of ["DEU", "BRA"]) {
        const scene = computeGeoScene({ target: countries[code], neighborCodes: [] });
        expect(scene.targetBoost).toBeLessThan(LOCATOR_RING_MIN_BOOST);
        expect(scene.locatorCenters).toEqual([]);
      }
    });
  });

  describe("clusterCenters", () => {
    const near = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const adjacent = { minX: 12, minY: 0, maxX: 22, maxY: 10 };
    const far = { minX: 200, minY: 200, maxX: 210, maxY: 210 };

    it("merges bounds whose centers are within mergeDistance into one union-bbox center", () => {
      // near (center 5,5) and adjacent (center 17,5) are 12 apart — merged
      // under a distance of 20 into the union bbox (0..22)'s center.
      expect(clusterCenters([near, adjacent], 20)).toEqual([{ x: 11, y: 5 }]);
    });

    it("keeps far-apart bounds as separate centers", () => {
      expect(clusterCenters([near, far], 20)).toEqual([
        { x: 5, y: 5 },
        { x: 205, y: 205 },
      ]);
    });

    it("returns an empty list for no bounds", () => {
      expect(clusterCenters([], 20)).toEqual([]);
    });
  });

  describe("maxZoom", () => {
    it("returns a zoom multiplier greater than 1 (some zoom-out range always available)", () => {
      const target = findTargetWithNeighbors();
      const scene = computeGeoScene({ target, neighborCodes: [] });
      expect(scene.maxZoom).toBeGreaterThan(1);
    });

    it("gives a small country a much larger maxZoom than a huge one (both need to reach the same world scale)", () => {
      // Lesotho's own viewBox is tiny relative to the world; Russia's is
      // (relatively) enormous — Lesotho needs a far bigger zoom multiplier
      // to reveal the same fixed world width.
      const small = computeGeoScene({ target: countries["LSO"], neighborCodes: [] });
      const huge = computeGeoScene({ target: countries["RUS"], neighborCodes: [] });
      expect(small.maxZoom).toBeGreaterThan(huge.maxZoom);
    });
  });
});

describe("world-edge behavior (wrap + vertical lock)", () => {
  it("clampWorldCenterY keeps the visible window inside the world's EFFECTIVE height", () => {
    const extent = worldExtentY();
    // The data extent is inset from the projection extent on both sides
    // (Natural Earth stops at the ice edges, not the theoretical poles).
    expect(extent.top).toBeGreaterThan(0);
    expect(extent.bottom).toBeLessThan(WORLD_HEIGHT);
    // Window smaller than the world: center clamps to [top+half, bottom-half].
    expect(clampWorldCenterY(extent.top - 200, 800)).toBe(extent.top + 400); // near top -> pushed down
    expect(clampWorldCenterY(extent.bottom + 200, 800)).toBe(extent.bottom - 400); // near bottom -> pushed up
    expect(clampWorldCenterY(1000, 800)).toBe(1000); // mid-world -> untouched
    // Window equal to (or beyond) the full effective height: only valid center is the middle.
    const middle = extent.top + extent.height / 2;
    expect(clampWorldCenterY(1700, extent.height)).toBe(middle);
    expect(clampWorldCenterY(300, extent.height + 500)).toBe(middle);
  });

  it("maxZoom is height-fit: at maxZoom the viewport's world-window equals the world height", () => {
    const target = findTargetWithNeighbors();
    const daily = { target, neighborCodes: target.neighbor_codes.slice(0, 3) };
    const renderPx = 1280;
    const viewportHeightPx = 800;
    const scene = computeGeoScene(daily, renderPx, viewportHeightPx);
    const visibleAtMax = viewportHeightPx * scene.pxScale * scene.maxZoom;
    expect(visibleAtMax).toBeCloseTo(worldExtentY().height, 5);
  });
});
