# Geo 2.5D — migrating the map from SVG to Three.js

> **STATUS: SHELVED — decided against, 2026-07-14, same day it was written.**
> During the design grill (Q1: zoom-reveal presentation), the user compared
> the tuned spike against the current SVG game and preferred the original's
> look and feel. Deciding factors: the flat outline presents country shapes
> at maximum fidelity (the tilted camera foreshortens them, and shape
> recognition is the game's core skill); the draw-on line doubles as the
> clock in a way a rising slab can't (a half-risen slab leaks the full
> shape early — a hint-economy regression); the 3D wow front-loads into the
> first seconds while its perf/battery/migration costs are permanent. The
> spike (`src/spike/`) and its deps (three, @react-three/fiber,
> @types/three) were removed; the research
> (`docs/research/research-threejs-migration-geo.md`) and this PRD remain
> as the record. Revisit post-v1 only with a new explicit decision — and
> take the *depth-cue polish* ideas (shadow, lift-on-solve, parallax) into
> the SVG version instead (see `ideas.md`).
>
> Replace the SVG/Framer Motion map layer with the validated 2.5D extruded Three.js scene (lit rising slabs, camera-rig zoom, perspective CSS3D labels) while every line of game logic and all DOM UI stays untouched.
>
> *Generated 2026-07-14 by generate-prd from in-session discussion (Three.js research report + `src/spike/ExtrudedMapSpike.tsx` iteration, user-approved at each step).*

## Problem

The current flat SVG map plays well but doesn't *look* like the experiences
the project aspires to — the polished Three.js games and interactives the
user cited as the bar ("really good examples of games and projects done on
Three.js"). Visual depth is not polish here; per the user it's part of the
product: "We want the user to feel like things are raising or 3D or just
very much more appealing. That's a big part of this experience."

A research pass (`docs/research/research-threejs-migration-geo.md`)
concluded a *flat* port to Three.js would cost weeks and look near-identical
— but a deliberate 2.5D visual pivot is exactly where WebGL pays. A
throwaway spike (`src/spike/ExtrudedMapSpike.tsx`, `?spike=3d`) validated
that pivot end to end: look, rise animation, zoom-to-world camera, and
redacted labels all work, reusing the existing game logic unchanged.

## Solution

The map layer becomes a Three.js scene rendered via react-three-fiber; the
game around it does not change. Spike-validated visual spec:

- **Extruded country slabs** on a dark flat world plane: the daily target
  as a light, lit slab; its 3 neighbors at the **same full height**
  (user-preferred over tiered heights) in a darker material; all other
  countries as barely-raised dark context outlines.
- **Rise-in replaces draw-on**: countries animate up from the plane
  (ease-out scale-z) instead of stroking their outlines — the "things
  raising" feel. In the real game this rise is paced by the round clock,
  taking over the role the Framer Motion `pathLength` draw-on plays today.
- **Tilted perspective camera with a zoom rig**: default framing is low
  and ~45° tilted on the centered target; zooming out lifts and pitches
  the camera toward near-top-down, re-aiming from the target to the
  world's center, so full zoom-out reads like a proper world map. One
  smoothed camera path driven by a single `zoomProgress` number — the
  existing zoom-economy logic (`lib/game/zoom.ts`) plugs in unchanged.
- **Perspective CSS3D labels**: neighbor names as real DOM text lying flat
  on the slab tops via `CSS3DRenderer` (ships inside `three`), inheriting
  the camera's exact perspective. Reuses `useNeighborReveal` (slot-machine
  scramble) and `layoutLabels` (collision nudging) verbatim. Approved
  styling: Geist (not Geist Mono), weight 400, normal letter spacing,
  ~13–14px on-screen equivalent at default framing (`LABEL_SCALE` 0.0038),
  white locked letters / 40%-white scrambling letters.
- **Hybrid DOM + canvas architecture** (research Option D): keyboard,
  score, dot-matrix clock, trivia, share UI, give-up — all stay DOM,
  layered over the canvas exactly as they layer over the SVG today.

## UX flow

Identical to the current game — same round structure, same inputs, same
outcomes. What changes is purely how the map hints render:

1. **Round start.** Clock starts; the target's slab begins rising from the
   dark world plane (paced to finish by ~40–50% of the clock, preserving
   `HINT_ONSET_FRACTION` semantics). Trivia + letter blanks unchanged.
2. **Neighbor hints.** Neighbor slabs rise on the same clock (finishing at
   0:00), their perspective labels scrambling/locking letters via the
   existing reveal pacing.
3. **Zoom-out (optional).** Scroll/pinch/buttons pull the camera up and
   back; same step penalties and world-reveal surcharge; drag-pan stays
   elastic and free within the paid radius. Post-round zoom stays free.
4. **Round end.** Solve → target name label + confetti as today (label
   likely becomes a CSS3D or DOM element over the slab). Fail → country
   stays hidden. Share string unchanged.

## Technical architecture

```
Keep (zero changes):
  src/lib/game/**        clock, penalties, zoom economy, letter logic,
                         daily selection, neighbor reveal, score
  src/lib/streak/**      localStorage streak
  src/lib/share/**       share string
  src/lib/geo/pathBounds, labelLayout, scene (viewBox math reused for
                         bounds/anchors even though the SVG viewBox goes)
  DOM UI components      Keyboard, DotMatrixNumber, TriviaOverlay,
                         ShareResult, score display, give-up

Replace:
  App.tsx SVG scene      -> <Canvas> scene (r3f), from the spike:
    CountryOutline (stroke draw-on)   -> CountrySlab (ExtrudeGeometry +
                                         EdgesGeometry, rise via scale.z)
    WorldMapLayer (radial opacity)    -> context slabs + lighting
                                         (spotlight-equivalent TBD)
    NeighborsLayer SVG labels         -> CSS3DRenderer labels (portaled
                                         React content, LabelProjector
                                         pattern from spike)
    SVG <g> zoom/pan transforms       -> CameraRig (zoomProgress-driven
                                         pose lerp, world-bounds-derived
                                         far pose)

New helpers (promote from spike, with tests):
  pathToShapes.ts        M/L/Z SVG path -> THREE.Shape[] (dataset paths
                         are pure M/L/Z; holes currently render as
                         islands — needs a proper ring-classification
                         pass at migration time)

Deps: three, @react-three/fiber@^8 (React 18), @types/three — already
installed by the spike. No drei, no troika (DOM labels avoid WebGL text).
```

## Data model

No changes. `src/data/countries.json` (name, path, centroid,
neighbor_codes, unique_letters, is_island) already contains everything the
3D scene consumes — the spike proved the existing SVG path strings convert
directly to extrusion geometry at runtime.

## Pricing

Unchanged — free, no monetization, all dependencies free/open-source
(three, r3f), consistent with the project's standing constraint.

## Roadmap

- **M1 — Scene foundation:** promote `pathToShapes` (+ ring/hole handling
  + tests); `CountrySlab`, world plane, lighting as real components;
  static scene renders today's daily correctly at default framing.
- **M2 — Game-loop wiring:** rise animations paced by the round clock
  (target by `HINT_ONSET_FRACTION`, neighbors by full round);
  `zoomProgress` bridged to `useGameRound`'s zoom economy (penalties,
  surcharge, post-round free zoom); elastic drag-pan parity.
- **M3 — Labels & round end:** CSS3D label layer (reveal scramble,
  collision layout, approved styling); solved-state target label;
  confetti/share/outcome parity checks.
- **M4 — Swap & polish:** replace the SVG scene in `App.tsx` behind the
  same round API; remove `?spike=3d` and `src/spike/`; fix Antarctica
  over-lighting at world view; mobile perf pass (Stripe-style budget:
  antialias off if needed, merged context geometry, pixel-ratio cap).
- **Later:** camera drift/parallax juice; label leader lines for tiny
  countries; per-country label scaling; possible post-solve "all slabs
  rise to level" moment (user liked equal-height as a payoff idea).

## Risks

- **Mobile performance is unmeasured.** ~190 extruded meshes + edges +
  shadows on phone GPUs; Stripe needed antialias-off, geometry cuts, and
  pause-on-scroll to hold 60fps. Mitigations identified but unproven here
  — M4 gates the swap on a real phone-class test.
- **Battery/thermal cost of an always-on WebGL canvas** vs. the idle-cheap
  SVG — flagged in research, no direct benchmark exists.
- **DOM labels can't be occluded by geometry.** Invisible at the current
  camera tilt, but a constraint on future camera moves (orbit would break
  it; would force troika/SDF text).
- **Hole rings render as raised islands** in the spike's `pathToShapes`
  (e.g. Lesotho) — must be fixed properly in M1, not carried over.
- **13–14px labels flirt with the legibility floor on phones** once
  foreshortened; may need a camera-distance-based boost (noted during
  tuning, unresolved).
- **The radial spotlight reveal has no 3D equivalent yet** — the SVG
  world layer's zoom-driven radial fade needs a lighting/opacity design in
  the new scene (spike shows all context slabs statically).
- **CLAUDE.md/PRD.md drift**: both still describe the SVG draw-on as the
  core hint mechanic; must be updated when (not if) the migration lands,
  or the docs contradict the shipped game.

## Open questions

- Exact rise-animation pacing curve per layer (target vs neighbors vs
  context), and whether context slabs animate at all during a round.
- What the zoom-out *reveal* looks like in 3D (light radius? opacity by
  distance from target? fog?) — the mechanic's cost side is settled, the
  presentation side isn't.
- Where the trivia overlay and solved-state country label live in the new
  stack (DOM over canvas vs CSS3D on the slab).
- Whether `?height=tiered` and other spike toggles survive as debug flags
  or die with the spike.
- Mobile perf budget numbers (target device class, minimum fps, pixel
  ratio cap) — decide before M4, measure during it.
- Whether the world-context slabs keep per-country `EdgesGeometry` or get
  merged into one geometry for draw-call economy (matters for the perf
  budget).
- Keyboard/DOM overlap: does the tilted scene need a different vertical
  centering scheme than the current `verticalOffsetPx` panel-measuring
  approach?
