import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import confetti from "canvas-confetti";
import { Keyboard } from "./components/Keyboard";
import { CountryPath } from "./components/CountryOutline";
import { NeighborsLayer } from "./components/NeighborsLayer";
import { WorldMapLayer } from "./components/WorldMapLayer";
import { TriviaOverlay } from "./components/TriviaOverlay";
import { ShareResult } from "./components/ShareResult";
import { DotMatrixNumber } from "./components/DotMatrixNumber";
import { getAllCountries, getDailyCountry } from "./lib/game/dailyCountry";
import { useGameRound } from "./lib/game/useGameRound";
import type { DisplayChar } from "./lib/game/useGameRound";
import { ZOOM_MIN, ZOOM_SENSITIVITY, ZOOM_STEP } from "./lib/game/zoom";
import { computeGeoScene } from "./lib/geo/scene";
import { viewBoxSize } from "./lib/geo/pathBounds";
import { useStreak } from "./lib/streak/useStreak";
import { generateShareString, getDayNumber } from "./lib/share";
import { computeScore, SCORE_SECONDS_MULTIPLIER } from "./lib/game/score";

const daily = getDailyCountry(new Date());
// The scene's <svg> fills the viewport via preserveAspectRatio="xMidYMid
// slice" (CSS background-size: cover behavior) — its true on-screen size is
// the LARGER of viewport width/height, not a fixed box. computeGeoScene
// needs that real size to convert "desired on-screen px" constants below
// into correct viewBox user-units.
const scene = computeGeoScene(daily, Math.max(window.innerWidth, window.innerHeight));
const dayNumber = getDayNumber(new Date());

// Center of the scene's viewBox — zooming out scales the map content around
// this fixed point, so the target stays centered regardless of zoom level.
const [ZOOM_ORIGIN_X, ZOOM_ORIGIN_Y] = (() => {
  const [minX, minY, w, h] = scene.viewBox.split(" ").map(Number);
  return [minX + w / 2, minY + h / 2];
})();

// Desired on-screen sizes (px) for the target outline stroke and neighbor
// labels, converted to viewBox user-units via the scene's pxScale so they
// read as a consistent size regardless of how large the target's true
// geographic bounding box is.
const TARGET_STROKE_PX = 1.75;
const NEIGHBOR_STROKE_PX = 1;
// Shared by the target's own solved-state label AND the neighbor labels —
// they read as the same visual "tier" of hint text, so they render at the
// same size rather than the target's being subtly larger.
const NEIGHBOR_LABEL_PX = 13;
const WORLD_STROKE_PX = 0.75;

/** Subtle grayish fill the target's shape gets once its own outline finishes drawing (outlineCompletion reaches 100) — a low-opacity white reads as gray against the black background. */
const TARGET_FILL_COLOR = "rgba(255, 255, 255, 0.12)";

/** One button click = one full ZOOM_STEP of zoom change — the same size step a scroll/pinch gesture crosses, so a button click costs exactly the same one-time penalty as scrolling that far (see lib/game/zoom.ts). */
const BUTTON_ZOOM_DELTA = ZOOM_STEP / ZOOM_SENSITIVITY;

/**
 * How far the player can drag-pan the view, expressed as a multiple of the
 * target's own base viewBox size per unit of zoom beyond ZOOM_MIN. At
 * ZOOM_MIN (no zoom-out yet) this is 0 — panning is disabled until you've
 * paid at least some zoom-out cost, since there's nothing extra revealed to
 * pan into yet. This deliberately keeps panning from being a free way to
 * peek at zoomed-in detail far from the target without ever crossing a
 * zoom-out penalty threshold.
 */
const PAN_RADIUS_FACTOR = 0.5;

/** How long the floating "+20"/"-150" score-delta popup stays on screen before fading out. */
const SCORE_DELTA_DISPLAY_MS = 1200;

// Static for the whole session — computed once rather than per-render.
const allCountries = getAllCountries();
// The target + its neighbors still get the world layer's opaque land-mask
// fill (see WorldMapLayer) — only their STROKE is suppressed there, since
// their own dedicated layers draw it progressively.
const worldLayerStrokeExclusions = new Set([daily.targetCode, ...daily.neighborCodes]);

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

/** Scales a pan vector down to `radius` if it exceeds it, leaving it untouched otherwise. */
function clampPan(pan: { x: number; y: number }, radius: number): { x: number; y: number } {
  const magnitude = Math.hypot(pan.x, pan.y);
  if (magnitude <= radius || magnitude === 0) return radius <= 0 ? { x: 0, y: 0 } : pan;
  const scale = radius / magnitude;
  return { x: pan.x * scale, y: pan.y * scale };
}

function App() {
  const round = useGameRound(daily.target, scene.maxZoom);
  const { streak, recordOutcome } = useStreak();
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
  // bonus/penalty event (see ScoreEvent) — NOT for the ordinary per-tick
  // decay, which just moves the score number itself. Keyed on the event's
  // own id so a repeated identical delta (e.g. two -150 wrong guesses back
  // to back) still restarts the fade instead of silently no-opping.
  const [activeDelta, setActiveDelta] = useState<{ id: number; points: number } | null>(null);
  useEffect(() => {
    if (!round.scoreEvent) return;
    setActiveDelta({ id: round.scoreEvent.id, points: round.scoreEvent.secondsDelta * SCORE_SECONDS_MULTIPLIER });
    const timer = setTimeout(() => setActiveDelta(null), SCORE_DELTA_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [round.scoreEvent]);

  // Re-clamps whenever the zoom level shrinks the allowed pan radius (e.g.
  // the player zooms back in after panning out) so a subsequent drag starts
  // from a valid position rather than jumping back into bounds all at once.
  useEffect(() => {
    setPan((prev) => clampPan(prev, maxPanRadius));
  }, [maxPanRadius]);

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
    setPan(clampPan(next, maxPanRadius));
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

  // Progress from 0 (default zoom) to 1 (zoomMax — fully zoomed out). A
  // mild ease-in (^1.15, not the much steeper ^2.5 tried earlier) so the
  // reveal is genuinely gradual and visible throughout the zoom range —
  // ^2.5 combined with the mask multiplying an already-faint base stroke
  // alpha made everything stay imperceptible until nearly fully zoomed
  // out, which read as "nothing happens" rather than a gradual reveal.
  // Drives a RADIAL reveal (not a flat fade) centered on the target —
  // countries near the target fade in first/strongest, with the spotlight
  // widening as the player zooms out.
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
  const worldLayerPeakOpacity = zoomProgress ** 1.15;
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
  }, [round.status, round.remainingSeconds, round.guesses]);

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
        style={{ transform: `translateY(${verticalOffsetPx}px)` }}
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
              zoom level (see PAN_RADIUS_FACTOR) — revealing more surrounding
              context via zoom costs time (lib/game/zoom.ts); panning itself
              is free but can never show more than that zoom level already
              paid for. */}
          <g
            className={isDragging ? undefined : "pan-snap"}
            transform={`translate(${pan.x} ${pan.y})`}
          >
            <g
              transform={`translate(${ZOOM_ORIGIN_X} ${ZOOM_ORIGIN_Y}) scale(${1 / round.zoom}) translate(${-ZOOM_ORIGIN_X} ${-ZOOM_ORIGIN_Y})`}
            >
              <WorldMapLayer
                countries={allCountries}
                excludeStrokeCodes={worldLayerStrokeExclusions}
                strokeWidth={WORLD_STROKE_PX * scene.pxScale}
                centerX={ZOOM_ORIGIN_X}
                centerY={ZOOM_ORIGIN_Y}
                revealRadius={worldLayerRevealRadius}
                peakOpacity={worldLayerPeakOpacity}
              />
              <CountryPath
                path={daily.target.path}
                completion={round.outlineCompletion}
                strokeWidth={TARGET_STROKE_PX * scene.pxScale}
                fillColor={round.outlineCompletion >= 100 ? TARGET_FILL_COLOR : "none"}
              />
              {/* Only on a genuine solve — a failed round keeps the country
                  hidden, same spoiler-safe rule the share string already
                  follows (see lib/share). Centered on the viewBox origin,
                  which is itself centered on the target's own bounding box
                  (see boundsToViewBox), so no separate label-position data
                  is needed. */}
              {round.status === "solved" && (
                <text
                  x={ZOOM_ORIGIN_X}
                  y={ZOOM_ORIGIN_Y}
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
                visible={round.neighborsVisible}
                completion={round.neighborCompletion}
                strokeWidth={NEIGHBOR_STROKE_PX * scene.pxScale}
                labelFontSize={NEIGHBOR_LABEL_PX * scene.pxScale}
                viewBox={scene.viewBox}
              />
            </g>
          </g>
        </svg>
      </div>
      <div className="app">
        {/* Fixed corner, independent of the centered .app__top/.app__bottom
            flow. Always visible (not gated on solve) — it's live during
            play (ticks with the clock, jumps on bonuses/penalties) and
            only force-zeroes on failure (see computeScore); no spoiler
            concern since it never reveals the country itself. */}
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
          {round.showTrivia && <TriviaOverlay code={daily.targetCode} />}
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
            same button click cost as one scroll/pinch step (see
            BUTTON_ZOOM_DELTA); zoom itself stays available after the round
            ends (see useGameRound's handleZoomWheel), so these aren't
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
