import { describe, expect, it } from "vitest";
import countriesData from "../../data/countries.json";
import type { Country } from "../game/dailyCountry";
import { computeGeoScene, worldExtentY } from "./scene";
import { computeCamera, clampPan, computeWorldReveal } from "./camera";
import { ZOOM_MIN } from "../game/zoom";

const countries = countriesData as Record<string, Country>;

// Paraguay: mid-latitude, so the world-edge clamp shouldn't bind at rest.
const VIEWPORT = 800;
const scene = computeGeoScene(
  { target: countries["PRY"], neighborCodes: ["BRA", "ARG"] },
  VIEWPORT,
  VIEWPORT,
);

describe("computeCamera", () => {
  it("pivots on the viewBox center", () => {
    const camera = computeCamera(scene, VIEWPORT, ZOOM_MIN, 0);
    const [minX, minY, w, h] = scene.viewBox.split(" ").map(Number);
    expect(camera.originX).toBeCloseTo(minX + w / 2);
    expect(camera.originY).toBeCloseTo(minY + h / 2);
  });

  it("gives no pan budget at ZOOM_MIN, growing with zoom-out", () => {
    expect(computeCamera(scene, VIEWPORT, ZOOM_MIN, 0).maxPanRadius).toBe(0);
    const zoomed = computeCamera(scene, VIEWPORT, 2, 0);
    expect(zoomed.maxPanRadius).toBeGreaterThan(0);
    expect(computeCamera(scene, VIEWPORT, 3, 0).maxPanRadius).toBeGreaterThan(zoomed.maxPanRadius);
  });

  it("does not shift the world at rest for a mid-latitude target", () => {
    expect(computeCamera(scene, VIEWPORT, ZOOM_MIN, 0).worldShiftY).toBe(0);
  });

  it("converts the panel offset from px to viewBox units via pxScale", () => {
    const camera = computeCamera(scene, VIEWPORT, ZOOM_MIN, 40);
    expect(camera.panelOffsetUnits).toBeCloseTo(40 * scene.pxScale);
  });

  it("straddles zero with the vertical pan bounds at mid zoom", () => {
    const camera = computeCamera(scene, VIEWPORT, 2, 0);
    expect(camera.panYMin).toBeLessThanOrEqual(0);
    expect(camera.panYMax).toBeGreaterThanOrEqual(0);
  });

  it("collapses the vertical pan bounds at full zoom-out (window spans the world's height)", () => {
    const camera = computeCamera(scene, VIEWPORT, scene.maxZoom, 0);
    expect(camera.panYMin).toBeCloseTo(0, 9);
    expect(camera.panYMax).toBeCloseTo(0, 9);
  });

  it("pins the window at the world edge for a far-south target instead of showing void", () => {
    const falklands = countries["FLK"];
    if (!falklands) return;
    const southScene = computeGeoScene({ target: falklands, neighborCodes: [] }, VIEWPORT, VIEWPORT);
    const camera = computeCamera(southScene, VIEWPORT, southScene.maxZoom * 0.9, 0);
    // The visible window's bottom edge must not extend past the world's
    // effective bottom: center + half-window <= bottom (within float noise).
    const visibleWorldHeight = VIEWPORT * southScene.pxScale * southScene.maxZoom * 0.9;
    const [, minY, , h] = southScene.viewBox.split(" ").map(Number);
    const desiredCy = minY + h / 2;
    const clampedCy = desiredCy - camera.worldShiftY;
    expect(clampedCy + visibleWorldHeight / 2).toBeLessThanOrEqual(worldExtentY().bottom + 1e-6);
  });
});

describe("clampPan", () => {
  it("returns the origin when there is no pan budget", () => {
    const camera = computeCamera(scene, VIEWPORT, ZOOM_MIN, 0);
    expect(clampPan(camera, { x: 100, y: 100 })).toEqual({ x: 0, y: 0 });
  });

  it("scales an over-budget vector back to the radius", () => {
    const camera = computeCamera(scene, VIEWPORT, 2, 0);
    const big = camera.maxPanRadius * 10;
    const clamped = clampPan(camera, { x: big, y: 0 });
    expect(Math.hypot(clamped.x, clamped.y)).toBeCloseTo(camera.maxPanRadius);
  });

  it("leaves an in-budget vector untouched (within the vertical bounds)", () => {
    const camera = computeCamera(scene, VIEWPORT, 2, 0);
    const small = { x: camera.maxPanRadius / 10, y: 0 };
    expect(clampPan(camera, small)).toEqual(small);
  });

  it("clamps y into the vertical pan bounds", () => {
    const camera = computeCamera(scene, VIEWPORT, scene.maxZoom, 0);
    // Full zoom-out: bounds collapse to ~0, so any y snaps back to it.
    const clamped = clampPan(camera, { x: 0, y: camera.maxPanRadius / 2 });
    expect(clamped.y).toBeCloseTo(0, 9);
  });
});

describe("computeWorldReveal", () => {
  it("starts dark at ZOOM_MIN and saturates by maxZoom", () => {
    expect(computeWorldReveal(scene, ZOOM_MIN).peakOpacity).toBe(0);
    expect(computeWorldReveal(scene, scene.maxZoom).peakOpacity).toBe(1);
  });

  it("reaches full opacity within about one absolute zoom-out unit, not a fraction of a huge range", () => {
    // Tiny-target days have enormous maxZoom; the opacity ramp must not
    // collapse to ~0 for the first paid steps (see the span rationale).
    expect(computeWorldReveal(scene, ZOOM_MIN + 1.1).peakOpacity).toBe(1);
  });

  it("widens the on-screen spotlight monotonically with zoom", () => {
    // revealRadius / zoom is the on-screen size (the ambient transform
    // divides by zoom) — it must strictly grow as the player zooms out.
    const onScreen = (zoom: number) => computeWorldReveal(scene, zoom).revealRadius / zoom;
    expect(onScreen(2)).toBeGreaterThan(onScreen(ZOOM_MIN));
    expect(onScreen(scene.maxZoom)).toBeGreaterThan(onScreen(2));
  });
});
