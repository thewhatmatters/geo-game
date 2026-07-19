import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import { Keyboard } from "./components/Keyboard";
import { CountryPath } from "./components/CountryOutline";
import { NeighborsLayer } from "./components/NeighborsLayer";
import { WorldMapLayer } from "./components/WorldMapLayer";
import { TriviaOverlay } from "./components/TriviaOverlay";
import { ShareResult } from "./components/ShareResult";
import { DotMatrixNumber } from "./components/DotMatrixNumber";
import { getAllCountries } from "./lib/game/dailyCountry";
import { useGameRound } from "./lib/game/useGameRound";
import type { DisplayChar } from "./lib/game/useGameRound";
import type { RoundBoot } from "./lib/game/boot";
import { ZOOM_MIN, ZOOM_SENSITIVITY, ZOOM_STEP, zoomStepsCrossed } from "./lib/game/zoom";
import { clampWorldCenterY, worldExtentY } from "./lib/geo/scene";
import { viewBoxSize } from "./lib/geo/pathBounds";
import { useStreak } from "./lib/streak/useStreak";
import { generateShareString } from "./lib/share";
import { computeScore, SCORE_SECONDS_MULTIPLIER } from "./lib/game/score";

// Desired on-screen sizes (px) for the target outline stroke and neighbor
// labels, converted to viewBox user-units via the scene's pxScale so they
// read as a consistent size regardless of how large the target's true
// geographic bounding box is.
const TARGET_STROKE_PX = 1.75;
// Tiny/scattered targets (scene.targetBoost > 1 — see SMALL_TARGET_SPAN in
// lib/geo/scene.ts) get their stroke thickened by the boost, capped at this
// on-screen ceiling, plus a soft white halo (the #target-halo filter below)
// so the outline reads against the black background even at squiggle scale.
// Both are no-ops for normal-size targets (boost === 1, no filter applied).
const SMALL_TARGET_STROKE_MAX_PX = 5;
const SMALL_TARGET_HALO_BLUR_PX = 3;
// Locator rings for scattered-micro-landmass days (scene.locatorCenters —
// see LOCATOR_RING_MIN_BOOST in lib/geo/scene.ts): a thin, low-opacity
// double ring centered on each landmass, drawn under the target outline.
// "Look here" markers for islands that are unavoidably fleck-sized even
// after the boost; absent entirely on normal days.
const LOCATOR_RING_RADIUS_PX = 28;
const LOCATOR_RING_OUTER_RADIUS_PX = 36;
const LOCATOR_RING_STROKE_PX = 1;
const LOCATOR_RING_COLOR = "rgba(255, 255, 255, 0.4)";
const LOCATOR_RING_OUTER_COLOR = "rgba(255, 255, 255, 0.15)";
const NEIGHBOR_STROKE_PX = 1;
// Shared by the target's own solved-state label AND the neighbor labels —
// they read as the same visual "tier" of hint text, so they render at the
// same size rather than the target's being subtly larger.
const NEIGHBOR_LABEL_PX = 13;
const WORLD_STROKE_PX = 0.75;

/** Subtle grayish fill the target's shape gets once its own outline finishes drawing (outlineCompletion reaches 100) — a low-opacity white reads as gray against the black background. */
const TARGET_FILL_COLOR = "rgba(255, 255, 255, 0.12)";
/** Pre-completion fill: fully transparent rather than "none", because CSS can't interpolate fill from "none" — the fill would pop in instead of fading (see CountryPath's fill transition). */
const TARGET_FILL_HIDDEN = "rgba(255, 255, 255, 0)";

/** One button click = one full ZOOM_STEP of zoom change — the same size step a scroll/pinch gesture crosses, so buttons and wheel stay proportionate (see lib/game/zoom.ts). */
const BUTTON_ZOOM_DELTA = ZOOM_STEP / ZOOM_SENSITIVITY;

/**
 * ABSOLUTE zoom-out units (zoom - ZOOM_MIN) over which the world layer's
 * reveal opacity ramps from 0 to full. Deliberately NOT a fraction of the
 * scene's full zoom range: maxZoom is derived from the target's viewBox
 * size, so on tiny-target days it's enormous (hundreds), and a
 * fraction-of-range opacity collapses to ~0 for the first several zoom
 * steps — the player zooms out and sees nothing change. Keyed to absolute
 * units, every step produces a visible brightness delta on every day-size.
 * Tuned so the first two button steps are each unmistakable at a glance:
 * step 1 (zoom 1.5) lands at 0.5/1.1 ≈ 0.45 revealed, step 2 (zoom 2.0)
 * at 1.0/1.1 ≈ 0.91, and step 3+ is fully saturated. The reveal RADIUS
 * still scales with the full range (see zoomProgress below), preserving
 * the radial near-target-first character.
 */
const WORLD_REVEAL_OPACITY_ZOOM_SPAN = 1.1;

/**
 * One-shot "reveal pulse" — an expanding, fading white ring detonating
 * from the map center each time the player's max zoom-out crosses a NEW
 * ZOOM_STEP boundary (see zoomStepsCrossed and the zoomSteps effect
 * below), so the newly revealed territory visibly lands on the map itself.
 * Rendered outside the pan/zoom transforms so its size is pure
 * screen-space px regardless of zoom level.
 */
const ZOOM_PULSE_DURATION_MS = 700;
const ZOOM_PULSE_START_RADIUS_PX = 40;
const ZOOM_PULSE_END_RADIUS_PX = 440;
const ZOOM_PULSE_STROKE_START_PX = 3;
const ZOOM_PULSE_STROKE_END_PX = 1;
/** Ring opacity at detonation, fading to 0 — white/gray only, per the dark theme. */
const ZOOM_PULSE_PEAK_OPACITY = 0.7;

/**
 * How far the player can drag-pan the view, expressed as a multiple of the
 * target's own base viewBox size per unit of zoom beyond ZOOM_MIN. At
 * ZOOM_MIN (no zoom-out yet) this is 0 — panning is disabled until you've
 * zoomed out at least one step, since there's nothing extra revealed to
 * pan into yet. This deliberately keeps panning from being a free way to
 * peek at zoomed-in detail far from the target without ever crossing a
 * zoom-out step threshold.
 */
const PAN_RADIUS_FACTOR = 0.5;

/** How long the floating "+20"/"-150" score-delta popup stays on screen before fading out. */
const SCORE_DELTA_DISPLAY_MS = 1200;

// Static for the whole session — pure data with no hidden inputs, so
// module scope is honest here (unlike the boot-derived values, which come
// in via the RoundBoot prop).
const allCountries = getAllCountries();

// Splits the target name's per-character reveal state at space boundaries
// into per-word groups — each group renders as its own bordered box row
// (see .display-name__group), with a plain gap between words rather than a
// boxed cell for the space itself.
function splitIntoWordGroups(chars: DisplayChar[]): DisplayChar[][] {
  const words: DisplayChar[][] = [];
  let current: DisplayChar[] = [];
  for (const c of chars) {
    if (c.char === " ") {
      if (current.length) words.push(current);
      current = [];
    } else {
      current.push(c);
    }
  }
  if (current.length) words.push(current);
  return words;
}

/**
 * Bounds a pan vector two ways: overall magnitude to `radius` (the paid
 * zoom-out budget), then the y component into [yMin, yMax] — the range
 * within which the visible world-window stays inside the world's effective
 * vertical extent. Horizontal stays free within the radius (the world
 * wraps seamlessly there); vertical hard-stops at the poles, collapsing to
 * zero at full zoom-out where the window already spans the whole height.
 */
function clampPan(
  pan: { x: number; y: number },
  radius: number,
  yMin: number,
  yMax: number,
): { x: number; y: number } {
  let { x, y } = pan;
  const magnitude = Math.hypot(x, y);
  if (radius <= 0) return { x: 0, y: 0 };
  if (magnitude > radius) {
    const scale = radius / magnitude;
    x *= scale;
    y *= scale;
  }
  return { x, y: Math.min(yMax, Math.max(yMin, y)) };
}

function App({ boot }: { boot: RoundBoot }) {
  const { daily, scene, dayNumber } = boot;

  // Center of the scene's viewBox — zooming out scales the map content
  // around this fixed point, so the target stays centered regardless of
  // zoom level.
  const [zoomOriginX, zoomOriginY] = useMemo(() => {
    const [minX, minY, w, h] = scene.viewBox.split(" ").map(Number);
    return [minX + w / 2, minY + h / 2];
  }, [scene.viewBox]);

  // The target + its neighbors still get the world layer's opaque land-mask
  // fill (see WorldMapLayer) — only their STROKE is suppressed there, since
  // their own dedicated layers draw it progressively.
  const worldLayerStrokeExclusions = useMemo(
    () => new Set([daily.targetCode, ...daily.neighborCodes]),
    [daily],
  );

  const round = useGameRound(daily.target, scene.maxZoom);
  const { streak, recordOutcome } = useStreak(boot.date);
  const recordedRef = useRef(false);
  const outlineRef = useRef<HTMLDivElement>(null);
  const topPanelRef = useRef<HTMLDivElement>(null);
  const bottomPanelRef = useRef<HTMLDivElement>(null);
  const [verticalOffsetPx, setVerticalOffsetPx] = useState(0);

  // Drag-to-pan: an offset (viewBox units) added on top of the zoom pivot.
  // Bounded by maxPanRadius below — see PAN_RADIUS_FACTOR — so panning can
  // never show more than the player's current zoom level already paid for.
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<{ startClientX: number; startClientY: number; startPan: { x: number; y: number } } | null>(null);
  const maxPanRadius = viewBoxSize(scene.viewBox) * (round.zoom - ZOOM_MIN) * PAN_RADIUS_FACTOR;

  // Vertical world-edge clamp: the zoom pivots on the target, so a far-north/
  // south target (Falklands, Iceland) would drag polar void into frame as the
  // viewport's world-window approaches the world's height. Shift the content
  // (in world units, inside the zoom transform) so the visible vertical
  // window stays inside the world; zero until the window nears an edge, so
  // default framing is untouched. Pairs with scene.ts's height-fit maxZoom
  // (window never EXCEEDS the world's height) and WorldMapLayer's horizontal
  // wrap (width overflow is seamless instead of clamped).
  //
  // The panel-centering offset participates too: it used to be a CSS
  // translateY on the whole <svg>, which moved the svg's edges with it and
  // re-exposed void past the clamped world edge. It's now an svg-internal
  // pan-level shift (screen-space px → viewBox units via pxScale), so the
  // svg always covers the full viewport and the clamp accounts for the
  // world-center the offset actually puts on screen (a pan-level shift of
  // dy moves the visible world center by -dy·zoom in world units). When the
  // window hits a world edge, edge-pinning wins over gap-centering.
  const panelOffsetUnits = verticalOffsetPx * scene.pxScale;
  const visibleWorldHeight = boot.viewport.height * scene.pxScale * round.zoom;
  const desiredWorldCenterY = zoomOriginY - panelOffsetUnits * round.zoom;
  const clampedWorldCenterY = clampWorldCenterY(desiredWorldCenterY, visibleWorldHeight);
  const worldShiftY = desiredWorldCenterY - clampedWorldCenterY;

  // Vertical pan budget: a pan of dy moves the visible world-center by
  // -dy·zoom, so these are the dy bounds that keep the window inside the
  // world's effective extent (same range the resting clamp above enforces).
  // At full zoom-out the window spans the whole height and both collapse
  // to 0 — vertical drag locks while horizontal drag (which wraps) stays
  // free. min/max guards absorb float error at exactly the ceiling.
  const halfWindow = visibleWorldHeight / 2;
  const panYMin = Math.min(0, (clampedWorldCenterY - (worldExtentY().bottom - halfWindow)) / round.zoom);
  const panYMax = Math.max(0, (clampedWorldCenterY - (worldExtentY().top + halfWindow)) / round.zoom);

  useEffect(() => {
    if (round.status === "running" || recordedRef.current) return;
    recordedRef.current = true;
    recordOutcome(round.status === "solved" ? "solved" : "failed");
  }, [round.status, recordOutcome]);

  // Fires exactly once per round, only on a genuine solve (not on give-up/
  // timeout) — recordedRef above already guards the transition, so this
  // effect only needs its own guard against React re-invoking effects
  // (e.g. StrictMode's dev double-invoke).
  const confettiFiredRef = useRef(false);
  useEffect(() => {
    if (round.status !== "solved" || confettiFiredRef.current) return;
    confettiFiredRef.current = true;
    confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
  }, [round.status]);

  // Transient "+20"/"-150" popup next to the score, one per discrete
  // score event (see ScoreEvent) — NOT for the ordinary per-tick decay,
  // which just moves the score number itself. Keyed on the event's own id
  // so a repeated identical delta back to back still restarts the fade
  // instead of silently no-opping. (No events are emitted under the pure
  // pacer; this comes alive with the event-sourced score economy.)
  const [activeDelta, setActiveDelta] = useState<{ id: number; points: number } | null>(null);
  useEffect(() => {
    if (!round.scoreEvent) return;
    setActiveDelta({ id: round.scoreEvent.id, points: round.scoreEvent.secondsDelta * SCORE_SECONDS_MULTIPLIER });
    const timer = setTimeout(() => setActiveDelta(null), SCORE_DELTA_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [round.scoreEvent]);

  // Reveal-pulse trigger: pure UI-layer detection of maxZoomReached
  // crossing a new ZOOM_STEP boundary (zoomStepsCrossed) — re-zooming over
  // already-seen territory re-fires nothing. Keyed on the step count so
  // consecutive steps restart the animation via remount.
  const crossedZoomSteps = zoomStepsCrossed(round.maxZoomReached);
  const [zoomPulseStep, setZoomPulseStep] = useState(0);
  const prevCrossedStepsRef = useRef(crossedZoomSteps);
  useEffect(() => {
    if (crossedZoomSteps > prevCrossedStepsRef.current) {
      prevCrossedStepsRef.current = crossedZoomSteps;
      setZoomPulseStep(crossedZoomSteps);
    }
  }, [crossedZoomSteps]);

  // Re-clamps whenever the zoom level shrinks the allowed pan budget (radius
  // or vertical range) so a subsequent drag starts from a valid position
  // rather than jumping back into bounds all at once.
  useEffect(() => {
    setPan((prev) => clampPan(prev, maxPanRadius, panYMin, panYMax));
  }, [maxPanRadius, panYMin, panYMax]);

  useEffect(() => {
    const el = outlineRef.current;
    if (!el) return;
    // Native listener (not React's onWheel) so preventDefault actually
    // stops the browser's own pinch-zoom/scroll behavior — React attaches
    // wheel handlers as passive by default, which silently ignores
    // preventDefault().
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      round.handleZoomWheel(e.deltaY);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [round.handleZoomWheel]);

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    dragStateRef.current = { startClientX: e.clientX, startClientY: e.clientY, startPan: pan };
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragStateRef.current;
    if (!drag) return;
    // scene.pxScale converts a desired ON-SCREEN px into viewBox user-units
    // (same conversion every other "desired px" constant in this file uses)
    // — applied to the raw pointer delta, content tracks the cursor 1:1.
    const dx = (e.clientX - drag.startClientX) * scene.pxScale;
    const dy = (e.clientY - drag.startClientY) * scene.pxScale;
    const next = { x: drag.startPan.x + dx, y: drag.startPan.y + dy };
    setPan(clampPan(next, maxPanRadius, panYMin, panYMax));
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    dragStateRef.current = null;
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
    // Elastic drag, not a persistent free-look pan: releasing always snaps
    // back to center (animated via the .pan-snap CSS transition below,
    // which is only applied while NOT dragging so live drag tracking stays
    // instant/unanimated).
    setPan({ x: 0, y: 0 });
  }

  // .app__top and .app__bottom are pinned to opposite viewport edges, but
  // aren't the same height (the bottom panel grows once the round ends —
  // round-outcome + share result get added on top of the keyboard). The
  // map itself is geometrically centered in the full viewport, so unequal
  // panel heights push the actually-clear viewing gap between them off
  // that center. Measure both panels and shift the map by half the
  // difference so it's centered in the CLEAR gap, not the raw viewport.
  // Re-measures on round.status change (bottom panel content changes) and
  // on window resize (text can wrap differently).
  useLayoutEffect(() => {
    function recomputeOffset() {
      const topH = topPanelRef.current?.getBoundingClientRect().height ?? 0;
      const bottomH = bottomPanelRef.current?.getBoundingClientRect().height ?? 0;
      setVerticalOffsetPx((topH - bottomH) / 2);
    }
    recomputeOffset();
    window.addEventListener("resize", recomputeOffset);
    return () => window.removeEventListener("resize", recomputeOffset);
  }, [round.status]);

  // Progress from 0 (default zoom) to 1 (zoomMax — fully zoomed out).
  // Drives the reveal RADIUS only — the reveal OPACITY is keyed to
  // absolute zoom-out units instead (see WORLD_REVEAL_OPACITY_ZOOM_SPAN),
  // clamped to the scene's own range so large-target days (maxZoom near
  // ZOOM_MIN — the range can be SHORTER than the fixed span) still reach
  // full opacity at their max. The reveal stays RADIAL (not a flat fade),
  // centered on the target — countries near the target fade in
  // first/strongest, with the spotlight widening as the player zooms out.
  //
  // revealRadius is in the SAME pre-ambient-transform (world) coordinate
  // space as the country paths, which is itself wrapped in the ambient
  // <g scale(1/zoom)> — so a radius that scales with `zoom` alone would
  // exactly cancel that ambient shrink and stay a CONSTANT size on screen.
  // To make the on-screen spotlight actually widen (not just move more
  // world-content past a fixed-size window), the radius needs an
  // additional, independent zoomProgress term on top of the `* zoom`
  // baseline — `(0.5 + zoomProgress)` — so it covers roughly half the
  // viewport at minimum zoom and comfortably overshoots the whole viewport
  // by the time zoomProgress reaches 1 (guaranteeing full, un-vignetted
  // coverage once fully zoomed out, not just a soft fade at the corners).
  const zoomProgress = Math.min(1, Math.max(0, (round.zoom - ZOOM_MIN) / (scene.maxZoom - ZOOM_MIN)));
  const opacityZoomSpan = Math.min(WORLD_REVEAL_OPACITY_ZOOM_SPAN, scene.maxZoom - ZOOM_MIN);
  const worldLayerPeakOpacity = Math.min(1, Math.max(0, (round.zoom - ZOOM_MIN) / opacityZoomSpan));
  const worldLayerRevealRadius = viewBoxSize(scene.viewBox) * round.zoom * (0.5 + zoomProgress);


  const shareString = useMemo(() => {
    if (round.status === "running") return null;
    return generateShareString({
      dayNumber,
      status: round.status,
      remainingSeconds: round.remainingSeconds,
      guesses: round.guesses,
      targetName: daily.target.name,
    });
  }, [round.status, round.remainingSeconds, round.guesses, dayNumber, daily.target.name]);

  return (
    <>
      {/* A fixed, full-viewport backdrop, kept as a sibling (not a child)
          of .app: .app gets an explicit z-index to reliably stack above
          it (position:fixed content otherwise paints above ordinary
          static-flow text regardless of DOM order, which is what made
          the map cover the title/streak text when nested inside .app
          without this). */}
      <div
        className={`outline-demo${isDragging ? " outline-demo--dragging" : ""}`}
        ref={outlineRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <svg
          viewBox={scene.viewBox}
          preserveAspectRatio="xMidYMid slice"
          className="outline-demo__svg"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Split in two: the OUTER <g> carries only the drag-pan offset
              (elastic — snaps back to translate(0,0) on release, animated
              via .pan-snap, which is deliberately omitted while actively
              dragging so live tracking stays instant). The INNER <g> carries
              the zoom pivot/scale, with NO transition, so scroll/pinch zoom
              stays immediately responsive rather than fighting a queued
              animation. Panning is bounded to a radius tied to the current
              zoom level (see PAN_RADIUS_FACTOR): zooming out reveals more
              surrounding context; panning itself is free but can never
              show more than the current zoom level already reveals. */}
          <g
            className={isDragging ? undefined : "pan-snap"}
            transform={`translate(${pan.x} ${pan.y + panelOffsetUnits})`}
          >
            <g
              transform={`translate(${zoomOriginX} ${zoomOriginY}) scale(${1 / round.zoom}) translate(${-zoomOriginX} ${-zoomOriginY})`}
            >
              {/* World-space vertical clamp shift (see worldShiftY above):
                  everything — map, target, labels — slides together so the
                  viewport never crosses the world's top/bottom edge. */}
              <g transform={`translate(0 ${worldShiftY})`}>
              <WorldMapLayer
                countries={allCountries}
                excludeStrokeCodes={worldLayerStrokeExclusions}
                strokeWidth={WORLD_STROKE_PX * scene.pxScale}
                centerX={zoomOriginX}
                centerY={zoomOriginY}
                revealRadius={worldLayerRevealRadius}
                peakOpacity={worldLayerPeakOpacity}
              />
              {scene.targetBoost > 1 && (
                <defs>
                  {/* Generous filter region: the default (-10%..110% of the
                      path's own bbox) clips the blur on thin scattered
                      island paths whose bbox is mostly empty. */}
                  <filter id="target-halo" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur
                      in="SourceGraphic"
                      stdDeviation={SMALL_TARGET_HALO_BLUR_PX * scene.pxScale}
                      result="halo"
                    />
                    <feMerge>
                      <feMergeNode in="halo" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
              )}
              {scene.locatorCenters.map((center, i) => (
                <g key={i}>
                  <circle
                    cx={center.x}
                    cy={center.y}
                    r={LOCATOR_RING_OUTER_RADIUS_PX * scene.pxScale}
                    fill="none"
                    stroke={LOCATOR_RING_OUTER_COLOR}
                    strokeWidth={LOCATOR_RING_STROKE_PX * scene.pxScale}
                  />
                  <circle
                    cx={center.x}
                    cy={center.y}
                    r={LOCATOR_RING_RADIUS_PX * scene.pxScale}
                    fill="none"
                    stroke={LOCATOR_RING_COLOR}
                    strokeWidth={LOCATOR_RING_STROKE_PX * scene.pxScale}
                  />
                </g>
              ))}
              <g filter={scene.targetBoost > 1 ? "url(#target-halo)" : undefined}>
                <CountryPath
                  path={daily.target.path}
                  completion={round.outlineCompletion}
                  strokeWidth={
                    Math.min(TARGET_STROKE_PX * scene.targetBoost, SMALL_TARGET_STROKE_MAX_PX) *
                    scene.pxScale
                  }
                  fillColor={round.outlineCompletion >= 100 ? TARGET_FILL_COLOR : TARGET_FILL_HIDDEN}
                />
              </g>
              {/* Only on a genuine solve — a failed round keeps the country
                  hidden, same spoiler-safe rule the share string already
                  follows (see lib/share). Centered on the viewBox origin,
                  which is itself centered on the target's own bounding box
                  (see boundsToViewBox), so no separate label-position data
                  is needed. */}
              {round.status === "solved" && (
                <text
                  x={zoomOriginX}
                  y={zoomOriginY}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={NEIGHBOR_LABEL_PX * scene.pxScale}
                  fontFamily='"Geist Mono", monospace'
                  fontWeight={500}
                  fill="#fff"
                  style={{ textTransform: "uppercase" }}
                >
                  {daily.target.name}
                </text>
              )}
              <NeighborsLayer
                slots={scene.neighbors}
                completion={round.neighborCompletion}
                strokeWidth={NEIGHBOR_STROKE_PX * scene.pxScale}
                labelFontSize={NEIGHBOR_LABEL_PX * scene.pxScale}
                viewBox={scene.viewBox}
              />
              </g>
            </g>
          </g>
          {/* Reveal pulse — see ZOOM_PULSE_* constants. Outside both the
              pan and zoom <g>s, so the ring expands in constant screen-space
              px from the viewport center (the zoom pivot) no matter how far
              out the player is. Remounts per step via the key, restarting
              the animation; unmounts when done to keep the DOM clean. */}
          {zoomPulseStep > 0 && (
            <motion.circle
              key={zoomPulseStep}
              data-testid="zoom-pulse"
              cx={zoomOriginX}
              cy={zoomOriginY}
              fill="none"
              stroke="#fff"
              style={{ pointerEvents: "none" }}
              initial={{
                r: ZOOM_PULSE_START_RADIUS_PX * scene.pxScale,
                strokeWidth: ZOOM_PULSE_STROKE_START_PX * scene.pxScale,
                opacity: ZOOM_PULSE_PEAK_OPACITY,
              }}
              animate={{
                r: ZOOM_PULSE_END_RADIUS_PX * scene.pxScale,
                strokeWidth: ZOOM_PULSE_STROKE_END_PX * scene.pxScale,
                opacity: 0,
              }}
              transition={{ duration: ZOOM_PULSE_DURATION_MS / 1000, ease: "easeOut" }}
              onAnimationComplete={() => setZoomPulseStep(0)}
            />
          )}
        </svg>
      </div>
      <div className="app">
        {/* Fixed corner, independent of the centered .app__top/.app__bottom
            flow. Always visible (not gated on solve) — it's live during
            play (ticks with the clock) and only force-zeroes on failure
            (see computeScore); no spoiler concern since it never reveals
            the country itself. */}
        <p className="score-display" data-testid="score-display">
          Score: {computeScore(round.status, round.remainingSeconds)}
          {activeDelta && (
            <span
              key={activeDelta.id}
              className={`score-delta ${activeDelta.points >= 0 ? "score-delta--positive" : "score-delta--negative"}`}
            >
              {activeDelta.points >= 0 ? `+${activeDelta.points}` : activeDelta.points}
            </span>
          )}
        </p>
        {/* Pinned to the top edge, leaving the center of the screen — where
            the target actually renders — completely unobstructed. Seeing
            the outline clearly is the whole point of the game. */}
        <div className="app__top" ref={topPanelRef}>
          <h1>Geo</h1>
          <p className="streak" data-testid="streak">
            Streak: {streak.current_streak} (best {streak.longest_streak})
          </p>
          <div className="clock" data-testid="clock">
            <DotMatrixNumber value={Math.ceil(round.remainingSeconds)} />
          </div>
        </div>
        {/* Pinned to the bottom edge, same reasoning. */}
        <div className="app__bottom" ref={bottomPanelRef}>
          {/* Sits above the blanks, off the map entirely — previously
              centered over the outline itself, where white text on the
              white outline lines was hard to read. */}
          <TriviaOverlay code={daily.targetCode} />
          <div className="display-name" data-testid="display-name">
            {splitIntoWordGroups(round.displayChars).map((word, wordIndex) => (
              <div className="display-name__group" key={wordIndex}>
                {word.map((displayChar, charIndex) => (
                  <span className="display-name__cell" key={charIndex}>
                    {displayChar.revealed ? displayChar.char : ""}
                  </span>
                ))}
              </div>
            ))}
          </div>
          {round.status !== "running" && (
            <p className="round-outcome" data-testid="round-outcome">
              {round.status === "solved" ? "Solved!" : "Failed"}
            </p>
          )}
          {shareString && <ShareResult shareString={shareString} />}
          <Keyboard
            guesses={round.guesses}
            onGuess={round.guessLetter}
            disabled={round.status !== "running"}
          />
          <button
            type="button"
            className="give-up"
            onClick={round.giveUp}
            disabled={round.status !== "running"}
          >
            Give up
          </button>
        </div>
        {/* Fixed corner cluster, independent of the top/bottom panel flow —
            one click crosses the same ZOOM_STEP as one scroll/pinch step
            (see BUTTON_ZOOM_DELTA); zoom itself stays available after the
            round ends (see useGameRound's handleZoomWheel), so these aren't
            disabled on solved/failed. */}
        <div className="zoom-controls">
          <button
            type="button"
            className="zoom-controls__button"
            onClick={() => round.handleZoomWheel(-BUTTON_ZOOM_DELTA)}
            disabled={round.zoom <= ZOOM_MIN}
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            className="zoom-controls__button"
            onClick={() => round.handleZoomWheel(BUTTON_ZOOM_DELTA)}
            disabled={round.zoom >= scene.maxZoom}
            aria-label="Zoom out"
          >
            −
          </button>
        </div>
      </div>
    </>
  );
}

export default App;
