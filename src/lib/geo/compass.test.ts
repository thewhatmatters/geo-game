import { describe, expect, it } from "vitest";
import { assignCompassAnchors, computeNeighborSlots } from "./compass";
import { getDailyCountry, getCountry } from "../game/dailyCountry";

describe("assignCompassAnchors", () => {
  const target = { centroid: { lat: 0, lng: 0 } };

  it("places a due-north neighbor at N and a due-south neighbor at S", () => {
    const slots = assignCompassAnchors(target, [
      { code: "N1", country: { centroid: { lat: 10, lng: 0 } } },
      { code: "S1", country: { centroid: { lat: -10, lng: 0 } } },
    ]);
    expect(slots.find((s) => s.code === "N1")?.anchor).toBe("N");
    expect(slots.find((s) => s.code === "S1")?.anchor).toBe("S");
  });

  it("places a due-east neighbor at E and a due-west neighbor at W", () => {
    const slots = assignCompassAnchors(target, [
      { code: "E1", country: { centroid: { lat: 0, lng: 10 } } },
      { code: "W1", country: { centroid: { lat: 0, lng: -10 } } },
    ]);
    expect(slots.find((s) => s.code === "E1")?.anchor).toBe("E");
    expect(slots.find((s) => s.code === "W1")?.anchor).toBe("W");
  });

  it("bumps a colliding neighbor to an adjacent unused anchor instead of overlapping", () => {
    const slots = assignCompassAnchors(target, [
      { code: "N1", country: { centroid: { lat: 10, lng: 0 } } },
      { code: "N2", country: { centroid: { lat: 10, lng: 0.001 } } },
    ]);
    const anchors = slots.map((s) => s.anchor);
    expect(new Set(anchors).size).toBe(2);
    expect(anchors).toContain("N");
  });

  it("is deterministic for the same inputs", () => {
    const neighbors = [
      { code: "A", country: { centroid: { lat: 5, lng: 5 } } },
      { code: "B", country: { centroid: { lat: -5, lng: 5 } } },
      { code: "C", country: { centroid: { lat: 5, lng: -5 } } },
    ];
    const first = assignCompassAnchors(target, neighbors);
    const second = assignCompassAnchors(target, neighbors);
    expect(first).toEqual(second);
  });
});

describe("computeNeighborSlots", () => {
  it("returns at most 3 slots and never errors for the daily selection", () => {
    const daily = getDailyCountry(new Date("2026-01-01T00:00:00Z"));
    const slots = computeNeighborSlots(daily);
    expect(slots.length).toBeLessThanOrEqual(3);
    expect(slots.length).toBe(daily.neighborCodes.length);
    slots.forEach((slot) => {
      expect(slot.country).toBeDefined();
      expect(slot.anchor).toBeDefined();
    });
  });

  it("returns an empty slot list for an island (0 land neighbors) without error", () => {
    const sriLanka = getCountry("LKA");
    expect(sriLanka.is_island).toBe(true);
    const slots = computeNeighborSlots({ target: sriLanka, neighborCodes: [] });
    expect(slots).toEqual([]);
  });
});
