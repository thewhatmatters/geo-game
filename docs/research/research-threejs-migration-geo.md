# Three.js for the geo daily game — feasibility, techniques, and migration paths

> **problem research · depth: standard · 2026-07-14** — Whether the current SVG + Framer Motion experience can/should be rebuilt or enhanced on Three.js.

**Question.** Can the geo daily-game's current experience (SVG country-outline draw-on animation via Framer Motion pathLength, D3 geo projections, zoom/pan world-map reveal) be rebuilt or enhanced on Three.js — feasibility, techniques used by comparable Three.js map/globe games, line-drawing animation options, performance on mobile, and migration/hybrid paths?

**TL;DR.** Yes, it's feasible — the standard recipe is d3-geo projections feeding Three.js geometry, which several tutorials and libraries (globe.gl/three-globe) already package. But the game's signature mechanic, a progressively drawing thin outline, is the *hardest* thing to reproduce in WebGL: native WebGL lines cap at 1px on common drivers, so you need triangulated "fat lines" (Line2/MeshLine) plus dash-offset or draw-range tricks, and crisp text labels need a separate SDF library (troika-three-text). The polished Three.js showcases (Stripe's globe, Awwwards winners) get their wow factor from 3D globes, particle fields, and custom shaders — not from doing flat 2D outline maps better than SVG. For ~200 static paths with one animated stroke, SVG is already the right-sized tool; the strongest argument for Three.js is a deliberate *visual pivot* (3D globe, depth, shader effects), not a port of the current look. A hybrid path — keeping the DOM UI and mounting a WebGL canvas only for the map layer — is well-precedented via react-three-fiber and is the recommended way in if you go.

## Problem framing

The current stack renders ~1 target + 3 neighbor outlines + a world-map reveal layer as SVG paths, animated with Framer Motion's `pathLength`, projected with d3-geo, inside a React/Vite app with a DOM on-screen keyboard, score display, and dot-matrix clock. The question is not "can Three.js draw a map" (it can) but three narrower ones:

1. Can the *specific signature effects* — progressive outline draw-on, redacted text labels, radial spotlight reveal — be reproduced or bettered in WebGL?
2. Do the "really good" Three.js showcase experiences derive their quality from something this game would actually use?
3. What's the migration cost and the mobile performance/battery bill?

Hidden assumption worth surfacing: the admired Three.js examples are mostly **3D** experiences (globes, depth, cameras, shaders). A faithful port of the current flat 2D map to Three.js buys almost none of that — the visual upgrade only materializes if the design itself goes 3D or shader-driven.

## Options

**Option A — Stay on SVG, polish harder.** SVG remains the recommended starting point for exactly this workload: guidance is to "start with SVG" and only move when object counts overwhelm it, since WebGL's win is "rendering large numbers of simple shapes" ([SVG vs Canvas vs WebGL 2026 comparison](https://www.svggenie.com/blog/svg-vs-canvas-vs-webgl-performance-2025); [yWorks rendering-stack comparison](https://www.yworks.com/blog/svg-canvas-webgl)). SVG also now gets hardware-accelerated CSS transforms/animations independent of JS ([Stack Overflow: Canvas vs SVG vs div](https://stackoverflow.com/questions/5882716/html5-canvas-vs-svg-vs-div)). The game renders a few hundred paths at most — nowhere near SVG's breaking point. Shader-like flourishes (glow, grain, vignette) can be approximated with SVG/CSS filters.

**Option B — Full Three.js rebuild, same flat-map design.** Feasible: convert TopoJSON → GeoJSON, run coordinates through the same d3-geo projection, and build `THREE.Line`/mesh geometry from the projected points — a long-established pattern ([SmartJava: Three.js + D3.js geo rendering](http://www.smartjava.org/content/render-geographic-information-3d-threejs-and-d3js); [Stack Overflow: GeoJSON as mesh in three.js](https://stackoverflow.com/questions/40520463/how-can-i-draw-geojson-in-three-js-as-a-mesh-and-not-a-line-and-fill-with-color)). Filled country shapes require triangulating polygons (earcut/ShapeGeometry) rather than just stroking paths. This option re-implements everything the browser currently does for free (path stroking, dashing, text, antialiasing, hit-testing) for little visual gain — see Gotchas.

**Option C — Visual pivot to a 3D globe on Three.js.** This is what the admired examples actually are. globe.gl / three-globe / react-globe.gl package country polygons, choropleths, arcs, and hex-binned surfaces on an interactive WebGL globe with a React wrapper ([globe.gl](https://globe.gl); [react-globe.gl](https://github.com/vasturiano/react-globe.gl)). Stripe's landing-page globe — 60,000 shader-driven dots in a sunflower spiral with country masking via a color-coded PNG — is the canonical polished example, and its writeup documents the real effort level ([Stripe: building the globe](https://stripe.com/blog/globe), WebFetch full page). The zoom-out world-reveal mechanic maps naturally to a globe (zoom = camera dolly; the "whole world visible" surcharge = seeing the full sphere). This changes the game's look substantially — target framing, neighbor compass slots, and outline recognizability (core to the game per CLAUDE.md's projection decision) all need redesign, since a sphere reintroduces the foreshortening problems the equal-area flat projection was chosen to avoid.

**Option D — Hybrid: WebGL map layer under the existing DOM UI.** Keep React DOM for keyboard/score/clock/share (they're UI, and DOM text/accessibility is strictly better), mount a react-three-fiber `<Canvas>` for just the map scene. This is a well-documented production pattern: 14islands runs a persistent shared WebGL canvas behind DOM content with components opting in via a `useCanvas()` hook, keeping "HTML/CSS as the foundational layer, with WebGL as an enhancement" ([14islands: progressive enhancement with WebGL and React](https://medium.com/14islands/progressive-enhancement-with-webgl-and-react-71cd19e66d4), WebFetch full page). R3F's docs and community consistently recommend this over hand-rolling Three.js lifecycle inside React, since React's mount/unmount churn can repeatedly create/destroy WebGL contexts ([three.js forum: plain Three.js inside React](https://discourse.threejs.org/t/best-way-to-integrate-plain-three-js-inside-a-react-app/27049); [R3F introduction](https://r3f.docs.pmnd.rs/getting-started/introduction)). Their pitfalls all cluster around scroll-syncing DOM to canvas — which this game doesn't have (fixed viewport, no scroll), so the hybrid is unusually clean here.

## Tradeoffs

| Axis | A: SVG polish | B: Three.js flat port | C: 3D globe pivot | D: Hybrid layer |
|---|---|---|---|---|
| Draw-on outline animation | Native (`pathLength`) | Hard — see Gotchas | Hard, same reasons | Hard for the WebGL parts |
| Text labels (neighbor names, solved label) | Native DOM/SVG text | Needs troika/SDF | Needs troika/SDF | Keep in DOM where possible |
| Visual ceiling | Filters/CSS only | ~same as SVG | Highest (shaders, depth, particles) | High for map, DOM for UI |
| Mobile perf/battery | Cheap for this shape count | Persistent GPU rasterization; Stripe had to disable antialiasing and pause animations for perf ([Stripe](https://stripe.com/blog/globe)) | Same, plus more geometry | Same as B/C for the canvas |
| Bundle | 0 new bytes | three.js core is large and effectively not tree-shakeable as one module — a single 8KB regression in r181 was forum-worthy; the community treats core size as a known lump ([three.js forum: tree-shaking state](https://discourse.threejs.org/t/what-is-the-state-of-tree-shaking/33168); [8KB size-increase thread](https://discourse.threejs.org/t/8kb-gzipped-size-increase-in-0-181-0-recommendation-on-tooling-to-analyze-package-size/87880)) | + globe.gl on top | three.js + R3F + drei |
| Migration cost | None | Rewrite all map rendering | Rewrite + redesign game framing | Rewrite map layer only |
| Keeps "outline recognizability" design pillar | Yes | Yes | At risk (sphere foreshortening) | Yes |

**The line-drawing problem, concretely** (this is the crux for a game whose core hint IS a drawing line): WebGL native lines have a driver-dependent max width — "users running ANGLE (i.e. most Windows Chrome/Edge) get a maximum of 1.0, which is pretty useless" — with no joins, caps, or reliable antialiasing; production apps use triangulated or instanced "fat lines" instead (MeshLine, Line2, extrude-polyline) ([Matt DesLauriers: Drawing Lines is Hard](https://mattdesl.svbtle.com/drawing-lines-is-hard), WebFetch full page). Progressive draw-on then can't use Framer Motion; the equivalents are `setDrawRange` on line geometry ([Stack Overflow: animate drawing of a line](https://stackoverflow.com/questions/42229799/how-to-smoothly-animate-drawing-of-a-line)) — which does not work straightforwardly on Line2 because fat lines are instanced planes per segment ([three.js forum: setDrawRange on Line2](https://discourse.threejs.org/t/setdrawrange-on-three-line2/2891); [Line2 instancing internals](https://discourse.threejs.org/t/how-to-update-line2-dynamically/37913)) — or `LineDashedMaterial` dash-offset tricks, which have their own long-standing quirks (`computeLineDistances` required; gap/scale bugs) ([three.js forum: animate LineDashedMaterial](https://discourse.threejs.org/t/how-can-i-animate-a-linedashedmaterial/4732); [Stack Overflow: dashes don't work](https://stackoverflow.com/questions/35781346/three-linedashedmaterial-dashes-dont-work)). MeshLine-based animation is the community's polished answer ([Codrops: Animated Mesh Lines](https://tympanus.net/codrops/2019/01/08/animated-mesh-lines); [Wael Yasmina: animating lines with MeshLine](https://waelyasmina.net/articles/animating-lines-and-curves-in-three-js-with-meshline)) — all workable, none as simple as the current one-prop `pathLength`.

**Text**: WebGL text is "a small nightmare involving texture atlases and signed distance fields"; troika-three-text is the de-facto solution ([WebGPU showcase on Troika](https://www.webgpu.com/showcase/troika-three-js-framework-webgl-text-rendering); [troika-three-text docs](https://protectwise.github.io/troika/troika-three-text)). The neighbor labels' slot-machine letter scramble would re-layout SDF text every frame — doable but a new performance surface. In the hybrid option, labels can stay as DOM overlays and skip this entirely.

## Recommendation

**Don't port the current design to Three.js — either stay on SVG (A) or commit to a real visual pivot via the hybrid path (D + C elements).** Rationale: at this object count SVG is inside its comfort zone and the sources are unanimous that WebGL's advantage only appears at scale or in 3D ([yWorks](https://www.yworks.com/blog/svg-canvas-webgl); [SVG Genie](https://www.svggenie.com/blog/svg-vs-canvas-vs-webgl-performance-2025)); meanwhile the two things the game leans on hardest — thin animated strokes and text — are precisely WebGL's two weakest primitives ([Drawing Lines is Hard](https://mattdesl.svbtle.com/drawing-lines-is-hard); [Troika writeup](https://www.webgpu.com/showcase/troika-three-js-framework-webgl-text-rendering)). *(inferred: combining the line-rendering and text sources with the game's current design, a flat-map port would cost weeks and look near-identical.)*

If the appetite is "make it feel like the Awwwards examples," the honest version of that is Option C's redesign — a globe or depth-staged scene with shader lighting — built as Option D's hybrid (R3F canvas for the map, DOM for all UI), prototyped first with react-globe.gl to test whether outline-recognizability survives on a sphere before hand-building anything. A cheap intermediate worth trying first: keep SVG but add WebGL-style *post effects* (grain, glow, vignette) via CSS/SVG filters — it tests whether "better UI" actually means "3D" before paying the migration bill. Note also the project's CLAUDE.md gotcha already warns against tile-map libraries as wrong-shaped; Three.js doesn't violate that letter, but the same "right tool for several fixed animated outlines" spirit currently favors SVG.

## Precedents

- **Stripe's globe** — the reference-quality Three.js geo experience: 60k dots, custom shaders, country masking via PNG lookup; they hit 60fps only after disabling antialiasing entirely, cutting geometry to ~20k dots, pausing animations on scroll, and keeping a static-image fallback ready ([Stripe blog](https://stripe.com/blog/globe), WebFetch full page). Signal: even a top-tier team treats mobile WebGL perf as a real budget, not a freebie.
- **globe.gl / three-globe ecosystem** — packaged country-polygon choropleths, arcs, hex-bins on a WebGL globe, with a maintained React wrapper ([globe.gl](https://globe.gl); [react-globe.gl](https://github.com/vasturiano/react-globe.gl)). The fastest way to prototype Option C.
- **14islands' site** — production hybrid DOM+R3F architecture with graceful no-WebGL degradation ([14islands](https://medium.com/14islands/progressive-enhancement-with-webgl-and-react-71cd19e66d4), WebFetch full page).
- **Community globe tutorials** — a Three.js globe tutorial notes country borders end up drawn twice (each border shared by two countries) when rendering outline data naively ([Robot Bobby globe tutorial](https://www.youtube.com/watch?v=f4zncVufL_I)) — a small example of the extra geometry bookkeeping WebGL demands.
- **Awwwards map collections** — the inspiration class of sites; predominantly WebGL/Three.js interactive 3D map experiences ([Awwwards maps collection](https://www.awwwards.com/awwwards/collections/maps-geolocation-streetview); [Awwwards Three.js collection](https://www.awwwards.com/awwwards/collections/three-js)).

## Open questions

- No source directly benchmarked *battery drain* of a persistent small WebGL canvas vs. an animated SVG on phones — the comparisons are frame-rate oriented. Follow-up: "WebGL canvas idle power consumption mobile benchmark".
- Whether outline-recognizability (the game's core skill) survives on a 3D globe at target-country framing wasn't researched — it's a design/playtest question, not a search question. Prototype with react-globe.gl before deciding Option C.
- Exact three.js core gzipped size for a current release wasn't pinned to a number in the surfaced sources (community threads discuss regressions and tooling, not a headline figure). Follow-up: "bundlephobia three@latest" or build a probe bundle.
- Comparable *daily geography games* (Worldle, Globle) rendering stacks weren't surfaced this sweep — worth checking whether any genre peer uses WebGL at all. Follow-up: "Globle worldle source rendering SVG or WebGL github".

---

## Sources

1. [Drawing Lines is Hard — Matt DesLauriers](https://mattdesl.svbtle.com/drawing-lines-is-hard) — WebFetch (full page), accessed 2026-07-14
2. [To design and develop an interactive globe — Stripe](https://stripe.com/blog/globe) — WebFetch (full page), accessed 2026-07-14
3. [Progressive Enhancement with WebGL and React — 14islands](https://medium.com/14islands/progressive-enhancement-with-webgl-and-react-71cd19e66d4) — WebFetch (full page), accessed 2026-07-14
4. [SVG vs Canvas vs WebGL: Which Should You Use? (2026) — SVG Genie](https://www.svggenie.com/blog/svg-vs-canvas-vs-webgl-performance-2025) — tavily, accessed 2026-07-14
5. [SVG, Canvas, WebGL? Visualization options for the web — yWorks](https://www.yworks.com/blog/svg-canvas-webgl) — tavily, accessed 2026-07-14
6. [HTML5 Canvas vs. SVG vs. div — Stack Overflow](https://stackoverflow.com/questions/5882716/html5-canvas-vs-svg-vs-div) — tavily, accessed 2026-07-14
7. [Render geographic information in 3D with Three.js and D3.js — SmartJava](http://www.smartjava.org/content/render-geographic-information-3d-threejs-and-d3js) — tavily, accessed 2026-07-14
8. [How can I draw geoJSON in three.js as a mesh — Stack Overflow](https://stackoverflow.com/questions/40520463/how-can-i-draw-geojson-in-three-js-as-a-mesh-and-not-a-line-and-fill-with-color) — tavily, accessed 2026-07-14
9. [Globe.GL](https://globe.gl) — tavily, accessed 2026-07-14
10. [react-globe.gl — GitHub](https://github.com/vasturiano/react-globe.gl) — tavily, accessed 2026-07-14
11. [Best way to integrate PLAIN Three.js inside a React app — three.js forum](https://discourse.threejs.org/t/best-way-to-integrate-plain-three-js-inside-a-react-app/27049) — tavily, accessed 2026-07-14
12. [Introduction — React Three Fiber docs](https://r3f.docs.pmnd.rs/getting-started/introduction) — tavily, accessed 2026-07-14
13. [setDrawRange on THREE.Line2 — three.js forum](https://discourse.threejs.org/t/setdrawrange-on-three-line2/2891) — tavily, accessed 2026-07-14
14. [How to update Line2 dynamically — three.js forum](https://discourse.threejs.org/t/how-to-update-line2-dynamically/37913) — tavily, accessed 2026-07-14
15. [How to smoothly animate drawing of a line — Stack Overflow](https://stackoverflow.com/questions/42229799/how-to-smoothly-animate-drawing-of-a-line) — tavily, accessed 2026-07-14
16. [How can I animate a LineDashedMaterial — three.js forum](https://discourse.threejs.org/t/how-can-i-animate-a-linedashedmaterial/4732) — tavily, accessed 2026-07-14
17. [THREE.LineDashedMaterial — dashes don't work — Stack Overflow](https://stackoverflow.com/questions/35781346/three-linedashedmaterial-dashes-dont-work) — tavily, accessed 2026-07-14
18. [Animated Mesh Lines — Codrops](https://tympanus.net/codrops/2019/01/08/animated-mesh-lines) — tavily, accessed 2026-07-14
19. [Animating Lines and Curves in Three.js with MeshLine — Wael Yasmina](https://waelyasmina.net/articles/animating-lines-and-curves-in-three-js-with-meshline) — tavily, accessed 2026-07-14
20. [Troika: The Three.js Framework That Solved WebGL Text Rendering — webgpu.com](https://www.webgpu.com/showcase/troika-three-js-framework-webgl-text-rendering) — tavily, accessed 2026-07-14
21. [Troika 3D Text docs](https://protectwise.github.io/troika/troika-three-text) — tavily, accessed 2026-07-14
22. [What is the state of tree-shaking? — three.js forum](https://discourse.threejs.org/t/what-is-the-state-of-tree-shaking/33168) — tavily, accessed 2026-07-14
23. [8KB gzipped size increase in 0.181.0 — three.js forum](https://discourse.threejs.org/t/8kb-gzipped-size-increase-in-0-181-0-recommendation-on-tooling-to-analyze-package-size/87880) — tavily, accessed 2026-07-14
24. [Create a 3D Globe with Three.js — Robot Bobby (YouTube)](https://www.youtube.com/watch?v=f4zncVufL_I) — tavily, accessed 2026-07-14
25. [Maps, Geolocation, StreetView collection — Awwwards](https://www.awwwards.com/awwwards/collections/maps-geolocation-streetview) — tavily, accessed 2026-07-14
26. [Three.js collection — Awwwards](https://www.awwwards.com/awwwards/collections/three-js) — tavily, accessed 2026-07-14
