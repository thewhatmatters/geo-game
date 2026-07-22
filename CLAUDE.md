# geo — CLAUDE.md

## Project overview
A daily geography guessing game, Wordle-adjacent but built around a live
countdown clock rather than a fixed guess count. One target country per
day, identical for every player. The player solves it via literal
Hangman-style letter guessing against a 60-second clock, while the
target's outline and three neighboring countries' outlines/letters draw
in simultaneously, and the player can optionally zoom out to reveal
further world-map context. The clock is a pure pacer — no action adds
or steals time. Implemented and in active playtesting on branch
`loop/geo-daily-quiz` — see `HANDOFF.md` for the current session's
state.

Full original design research (superseded in parts — see below) lives in
the vault:
`~/Library/Mobile Documents/iCloud~md~obsidian/Documents/OBSDN/ideas/geography-outline-quiz-game.md`
Treat this file and `PRD.md` as the current source of truth where they
diverge from the vault doc — the core guess mechanic changed from
multiple-choice to Hangman letter-guessing during design review, and the
discrete "hint stage" model became a continuous, time-driven reveal.

## Game design — the locked mechanics
This *is* the product; get it right before optimizing anything else.

**Core loop**
- One daily country, identical for every player (required for the
  shareable result to mean anything).
- Player guesses individual letters (Hangman-style) to fill in blanks of
  the country's name — not multiple choice, not full-name typing.
- A single flat **60-second countdown clock** per round (not scaled by
  country name length). The clock is a **pure pacer**: it counts 60 → 0
  at 1s/tick and no player action — wrong guesses, correct streaks,
  zooming — ever adds or steals time (the old wrong-guess time penalty,
  correct-streak +2s bonus, and zoom time costs are removed).
- Reaching 0:00 does **not** end or fail the round (transitional: a
  lockout mode with a wrong-guess budget replaces this) — the round
  simply continues with the clock parked at 0 and all hints fully drawn.
  An explicit "give up" button still ends the round as failed.
- No multiple-choice anywhere in this loop — that was the original vault
  design and is now superseded.

**Hints — continuous, driven by the same clock**
- The target country's outline AND its (up to) three neighboring
  countries' outlines all draw in **simultaneously from the very start**
  of the round, finishing at 100% exactly as the clock hits 0. This
  supersedes an earlier "staggered onset" design (neighbors delayed
  until ~40–50% elapsed) — dropped because it visibly contradicted the
  intended feel of hints accruing continuously as the clock runs down.
- Each neighbor outline has a redacted name label that reveals letters
  in randomized order (automatic, not player-guessed), paced by the
  same simultaneous draw-in.
- The target's own outline still finishes drawing faster than the
  neighbors' — by ~40–50% of the clock — since it's the primary hint.
  The trivia fact overlaid on it is no longer gated to that early
  window: it now stays up for the whole round, and after the round
  ends, so a solved/failed player can still read it.
- Neighbor slots are always fixed at **3**, positioned at their
  real-world compass direction relative to the target (snapped to the
  nearest anchor point; needs collision handling when multiple
  neighbors round to the same direction).
- Countries with more than 3 land neighbors: pick a deterministic
  subset, seeded the same way as the daily country (identical for every
  player that day, not random per player).
- Countries with 0 land neighbors (islands, e.g. Iceland, Sri Lanka):
  included in the daily rotation as legitimately harder days — no
  neighbor hints available at all.
- Micro-archipelago days (Wallis and Futuna, Tuvalu, …): the target's
  tiny true-scale footprint is **part of the intended hardness**, not a
  defect — decided 2026-07-17 after the first quality-gauntlet run. The
  accepted treatment is findability aids that preserve true relative
  scale (size-derived frame/stroke boost, halo, locator rings — see
  `targetBoost` in `lib/geo/scene.ts`); magnifier-inset cartouches were
  considered and rejected. Don't "fix" island-day shape size without a
  new explicit decision.
- Countdown is shown as a prominent dot-matrix numeric readout in the
  top-center header (`DotMatrixNumber`) — supersedes the original
  "small, unobtrusive, top-right" spec; playtesting favored a more
  legible display.
- Correct-guess streaks are still tracked in RoundCore
  (`correctStreak`, reset by any wrong guess) as the raw material for
  the score combo multiplier — but they no longer grant time.

**Map exploration — zoom/pan (new mechanic, not in the original design)**
- The player can scroll/pinch (or use on-screen +/− buttons, fixed
  top-left) to zoom out beyond the default framing, revealing the
  wider world map beyond the target + 3 fixed neighbors. Zooming no
  longer costs time (pure-pacer clock); step-crossing detection
  (`ZOOM_STEP` / `zoomStepsCrossed` in `lib/game/zoom.ts`) remains for
  the UI reveal pulse and the upcoming score-based zoom charge, and
  `maxZoomReached` still marks new vs re-crossed territory.
- Drag-to-pan is free but bounded to a radius proportional to how far
  the player has already zoomed out (`PAN_RADIUS_FACTOR`) — panning
  can never reveal more than the current zoom level already reveals.
  Releasing the drag snaps elastically back to center.
- Zoom stays available after the round ends (solved or failed) so the
  player can freely explore the revealed map.

**Live score**
- A running score is always visible (fixed top-right corner, paired
  with the top-left zoom controls): `SCORE_BASE_POINTS` (500) +
  `remainingSeconds * SCORE_SECONDS_MULTIPLIER` (10/sec) —
  `lib/game/score.ts`. It's a rescaled *presentation* of
  `remainingSeconds`, not a separate tracked value (interim scoring —
  the event-sourced score economy with combo multiplier replaces it).
- Freezes naturally on solve (the clock stops ticking); force-zeroed
  on failure/give-up — no reward for not solving.
- The transient "+20"/"−150" popup next to the score is wired to
  RoundCore's score-event log (never fired for ordinary per-tick
  decay); under the pure pacer no events are emitted yet — the score
  economy re-populates the log.
- A confetti burst (`canvas-confetti`) fires once, exactly on a
  genuine solve (not on give-up/timeout).

**Streak & sharing**
- Streak counter (consecutive days solved) is the daily-ritual hook.
- Persisted via **localStorage for now** — Supabase is deferred (see
  Tech stack), so streaks are per-device, not cross-device, until that
  lands.
- No numeric leaderboard — explicitly decided against for v1. Supabase's
  only job, when it's added, is persisting streak state.
- Shareable result: day number + time-remaining-when-solved (or
  "failed") + a spoiler-free guess-pattern row (colored squares for
  correct/wrong letters, no letters shown). The country/flag is revealed
  in the share string **only if the round was actually solved** — a
  failed run keeps the country hidden.

## Tech stack
- **Vite + React + TypeScript** as the project scaffold — a fully
  static app for now (no backend at all until Supabase lands later),
  so a zero-config static build is the right fit.
- **React + Framer Motion** for the draw-on outline animation
  (`pathLength`/`pathSpacing` props), reused for both the target outline
  and the 3 neighbor outlines.
- **`world-atlas` TopoJSON, 50m resolution** for country shapes. Not
  10m — full-detail coastlines (Indonesia, Philippines, Norway) stutter
  the draw animation. Not 110m — too coarse to be recognizable.
- **restcountries.com's `borders` field** for neighbor adjacency — don't
  hand-compute shared-edge adjacency from the topology.
- **Equal-area or equirectangular projection** (not Mercator) —
  Mercator's pole distortion (e.g. oversized Greenland) actively hurts
  outline recognizability, which is core to this game.
- **Hangman input: on-screen keyboard as the visual source of truth**
  (shows per-letter guessed/correct/wrong state on the keys), with
  physical keydown layered on top as a desktop convenience — both
  dispatch to the same guess-submission handler (same pattern Wordle
  uses).
- **Daily country + neighbor subset selection: deterministic hash,
  computed client-side at runtime** — `hash(UTC date) mod country_count`
  picks today's country (and the same scheme picks the neighbor subset
  for countries with >3 neighbors). No backend, no schedule file to
  maintain; works for any future date automatically. Requires the full
  country/outline/trivia dataset to ship in the client bundle, which is
  fine at ~190 countries.
- **localStorage for streak persistence, for now.** Supabase (Postgres)
  is deferred — not part of the initial build. When it lands, its only
  job is cross-device streak sync; there's still no numeric leaderboard
  planned.
- Trivia facts: LLM-generated for all ~190 countries, with a one-time
  human review pass before shipping — not hand-curated, not pulled live
  from an API at runtime.
- Disputed territories (Kashmir, Western Sahara, Northern Cyprus,
  Taiwan, etc.): follow `world-atlas`/Natural Earth's default handling
  as-is — no manual override policy.
- Free, no monetization, for v1.
- Everything above is free/open-source end to end; that constraint was
  deliberate, keep it that way unless a real limit is hit.
- **`canvas-confetti`** for the one-shot solve celebration — the only
  dependency added beyond the original stack list, kept because it's
  free/open-source and a one-liner for what it does.

## Architecture (implemented)
- `src/components/CountryOutline` → SVG draw-on animation, one path per
  country, driven by Framer Motion `pathLength`. Used for both the
  target and the 3 neighbor slots.
- `src/components/WorldMapLayer` → the zoom/pan world-map reveal layer
  (radial spotlight fade-in centered on the target, keyed off zoom
  progress).
- `src/components/NeighborsLayer` → the 3 compass-positioned neighbor
  outlines + redacted/revealing name labels.
- `src/components/Keyboard` → on-screen Hangman input, source of truth
  for per-letter guessed/correct/wrong state.
- `src/components/DotMatrixNumber` → the countdown clock's digit
  display.
- `src/components/TriviaOverlay`, `src/components/ShareResult` → the
  target's trivia fact and the post-round spoiler-safe share string.
- `src/components/Heatmap`, `src/components/StatsOverlay` → the
  contribution heatmap and the full-history view it lives in (US-017).
  **Entry point:** the end screen's Act 2 embeds a compact 12-week
  window; its "FULL HISTORY" button opens the 12-month (53-week) stats
  view as an **overlay, not a route** — the app has no router and the
  post-round map stays explorable underneath.
- `src/components/TrophyMap` → the trophy world map (US-018): every
  country drawn from the same projected paths the round uses, at a fixed
  full-world viewBox, filled by solve tier (green = in time, amber =
  late) and neutral where unsolved. Deliberately NOT `WorldMapLayer` —
  that layer exists to be revealed by the round's zoom mask and tiles
  itself 3× for the antimeridian wrap. Appears twice: compact (no
  legend) in the end screen's Act 2, full-size in `StatsOverlay`.
- `src/lib/geo/` → TopoJSON loading (`scene.ts`, `pathBounds.ts`),
  neighbor compass-direction slot assignment (`labelLayout.ts`).
- `src/lib/game/` → `round.ts` (RoundCore: the round's pure reducer —
  tick/guess/zoom/give-up state machine), `zoom.ts` (zoom-out step
  detection + pan-radius math), `score.ts` (interim live score derived
  from the clock), `useGameRound.ts` (ties it all together),
  `neighborReveal.ts` (randomized letter-reveal order),
  `dailyCountry.ts` (deterministic hash of UTC date → today's country +
  neighbor subset, no backend call).
- `src/lib/streak/` → localStorage-backed streak read/write
  (`useStreak.ts`). Swap for a Supabase-backed version later without
  changing the game-loop code that calls it.
- `src/lib/share/` → share-string generation (day number, outcome,
  guess-pattern row).
- `src/lib/stats/heatmap.ts` → pure ledger → calendar-grid derivation
  (columns are weeks, rows are days, UTC day math). Five cell states:
  `solved`, `solved_late`, `failed`, `frozen`, `missed` — plus `future`
  for days padding out the current week. Failed and frozen carry glyphs
  (`✕`, `❄`) so no state is told apart by color alone. The view is
  deliberately honest: misses and failures occupy the same real estate
  wins do.
- `src/lib/stats/trophyMap.ts` → pure `trophyMap` record + country
  dataset → render-ready country list (state `in_time` / `late` /
  `unsolved`, solve date, tooltip summary, `N/total` progress). One
  deliberate departure from the round view's true-scale rule: a SOLVED
  country whose footprint spans under `MICRO_MARKER_MAX_SPAN` world
  units (Luxembourg, Singapore, most island microstates render
  sub-pixel at whole-world scale) gets a locator dot instead of its own
  shape — an invisible trophy is not a trophy. Unsolved micro-countries
  never get one.
- `src/lib/save/` → the save-code codec (US-019): `codec.ts` (pure
  `GeoSave` ⇄ `GEO1.<base64url(compact JSON)>.<checksum>`), `merge.ts`
  (import merge — union of days, better outcome wins a shared day), and
  `index.ts` (the one storage-touching seam: decode → merge → write, so
  a bad code never reaches localStorage). **Two versions, two jobs:**
  the `GEO1` prefix versions the FRAME (a `GEO2` code is rejected by
  name), and the payload's first element versions the SAVE SCHEMA
  (migrated on decode). The compact form interns country codes in a
  dictionary and stores dates as day offsets — ~22 chars per recorded
  day. Deliberately pure of DOM/clock: this payload is what a future
  Supabase sync pushes.
- `src/components/SaveCode` → the export/import panel, rendered at the
  bottom of `StatsOverlay` (the app has no settings surface; backup
  belongs with the history it protects). Presentational — it takes an
  already-encoded code and delegates import upward to `useStreak`'s
  `importCode`, which re-runs the freeze pass and refreshes the streak,
  heatmap and trophy map in place (no reload).
- Trivia fact data lives alongside the generated country dataset (see
  `scripts/generate-countries-geo.mjs` / `merge-country-metadata.mjs`),
  not a separate `src/lib/trivia/` module as originally planned.

## Commands
- `npm run dev` — start the dev server.
- `npm run typecheck` — `tsc --noEmit`.
- `npm run test` — run the Vitest suite (`vitest run`).
- `npm run build` — typecheck + production build.
- `npm run lint` — ESLint.
- `npm run gen:countries-geo` / `npm run gen:countries` — regenerate
  the country/outline/trivia dataset from source data.
- `npm run qa:sweep -- http://localhost:PORT` — scripted browser sweep
  (`scripts/qa-sweep.mjs`): every terminal outcome, seven viewports from
  320px to 4K, reduced motion on/off, a five-day streak sequence with a
  frozen miss, plus per-element overflow/overlap/clipping, tab-order and
  zoom-pan-bounds assertions. Writes screenshots + `report.md` to
  `docs/qa/us-020/`. Needs a dev server running and Playwright on
  `NODE_PATH` — deliberately NOT a project dependency (QA-only tool).

## Open design decisions — needs playtesting, not just spec
- Score-economy values for the upcoming event-sourced score (combo
  multiplier steps, wrong-letter deduction tiers keyed off unique-letter
  count, zoom-step charge) — the old time-penalty tiers (-20s/-15s/-10s)
  are gone with the pure-pacer clock; point values need playtesting.
- Exact neighbor-slot compass-anchor scheme and collision-resolution
  rule when multiple neighbors round to the same direction.
- Exact deterministic-subset selection rule for countries with >3
  neighbors.
- Exact guess-pattern visual format for the share string.
- Trivia fact review process specifics (who reviews, what "verifiably
  true" bar is enforced).
- Zoom step size (`ZOOM_STEP`) and wheel sensitivity
  (`ZOOM_SENSITIVITY`) tuning — needs playtesting.
- Streak-based score multiplier (tabled in `ideas.md`) — one facet
  decided (keys off the solve-streak, not a login/open streak), tier
  values still undecided, not yet implemented.

## Gotchas
- Don't reach for Leaflet or MapLibre GL — both are built for
  pannable/zoomable tile maps, wrong tool for "several fixed-viewport
  animated outlines." D3 + world-atlas or plain SVG is the right shape.
- GSAP (incl. DrawSVG) went fully free in April 2025 — legitimate option
  for finer animation control if Framer Motion's `pathLength` isn't
  enough, not a paid tradeoff to avoid.
- Penalty scaling must key off **unique letters**, not raw name length —
  "Mississippi" (11 letters, 4 unique) should not be treated as harder
  than its unique-letter count implies.
- The vault doc's multiple-choice design and discrete 4-stage hint
  ladder are **superseded** by this file — don't reintroduce them
  without an explicit new decision.
- Reduced motion is honored in **three** places, and a new animation has
  to opt out at whichever one drives it: the `prefers-reduced-motion`
  block at the end of `index.css` (CSS animations/transitions),
  framer-motion's `useReducedMotion()` inside components, and
  `lib/ui/motion.ts`'s `prefersReducedMotion()` for effects with no
  element at all (the confetti burst, the zoom pulse).
- The end-screen panel is **taller than the viewport** on most screens
  once Act 2's heatmap and trophy map are in it, so it scrolls inside
  itself (`max-height` + `overflow-y: auto`). That `max-height` needs
  `box-sizing: border-box` or the panel's own padding pushes it ~40px
  past the viewport and clips the outcome headline off the top.
- Answer-slot sizing multiplies **two independent** CSS custom
  properties — `--cell-density` (from the name's length, set by
  `answerSize`) and `--cell-viewport` (from the breakpoint). A plain
  width override in a media query loses to the `[data-size]` attribute
  selector; the multipliers compose instead.
- `document.body.scrollWidth` is **not** a reliable mobile-overflow
  check in this repo — `.app` is `position: fixed; inset: 0`, and
  fixed subtrees don't propagate overflow into `body.scrollWidth`. Use
  `getBoundingClientRect()` per-element or a screenshot instead (see
  vault: `web/position-fixed-hides-overflow-from-body-scrollwidth.md`).

<!-- wire-vault:start -->
## Knowledge vault — project layer

This project's durable knowledge (overview, decisions, gotchas) lives in the
cross-project vault at `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/OBSDN/projects/geo/`.

- **Read first:** before re-deriving an architecture decision or re-debugging
  a non-obvious issue, check `projects/geo/index.md` there.
- **Write path:** durable insights go through `/curate-vault` (gated) —
  never write vault articles directly.
<!-- wire-vault:end -->
