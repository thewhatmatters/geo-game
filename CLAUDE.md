# geo — CLAUDE.md

## Project overview
A daily geography guessing game, Wordle-adjacent but built around a live
countdown clock rather than a fixed guess count. One target country per
day, identical for every player. The player solves it via literal
Hangman-style letter guessing against a 60-second clock, while the
target's outline draws itself and — after the clock crosses a threshold —
three neighboring countries' outlines and letters gradually reveal too.
Greenfield, no code yet.

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
  country name length).
- Each wrong letter guess subtracts time, **scaled by the country's
  unique-letter count** (fewer unique letters = harsher penalty, since
  the puzzle is otherwise easier): illustrative tiers — ≤5 unique
  letters → -20s, 6–9 → -15s, 10+ → -10s. Exact tiers/values need
  playtesting.
- Clock hits 0:00 → round failed. An explicit "give up" button produces
  the same outcome early.
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
  neighbors' — by ~40–50% of the clock — since it's the primary hint;
  a trivia fact is shown overlaid on it only during that early window.
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
- Countdown is shown as a small numeric readout, top-right corner —
  deliberately unobtrusive since the outline itself is already an
  implicit timer.

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

## Architecture (planned — nothing scaffolded yet)
- `src/components/CountryOutline` → SVG draw-on animation, one path per
  country, driven by Framer Motion `pathLength`. Used for both the
  target and the 3 neighbor slots.
- `src/lib/geo/` → TopoJSON loading, country lookup, neighbor resolution
  via restcountries `borders`, compass-direction slot assignment.
- `src/lib/game/` → clock/penalty state machine, letter-guess (Hangman)
  logic, `dailyCountry.ts` (deterministic hash of UTC date → today's
  country + neighbor subset, no backend call).
- `src/lib/streak/` → localStorage-backed streak read/write. Swap for a
  Supabase-backed version later without changing the game-loop code
  that calls it.
- `src/lib/trivia/` → static per-country trivia fact data (LLM-
  generated, human-reviewed).

## Commands
None yet — no scaffold exists. Stack is decided (Vite + React +
TypeScript); once scaffolded via `npm create vite@latest -- --template
react-ts`, add the real `dev`/`build`/`lint` invocations here.

## Open design decisions — needs playtesting, not just spec
- Exact time-penalty tiers by unique-letter count (illustrative only:
  -20s/-15s/-10s).
- Exact neighbor-slot compass-anchor scheme and collision-resolution
  rule when multiple neighbors round to the same direction.
- Exact deterministic-subset selection rule for countries with >3
  neighbors.
- Exact guess-pattern visual format for the share string.
- Trivia fact review process specifics (who reviews, what "verifiably
  true" bar is enforced).

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

<!-- wire-vault:start -->
## Knowledge vault — project layer

This project's durable knowledge (overview, decisions, gotchas) lives in the
cross-project vault at `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/OBSDN/projects/geo/`.

- **Read first:** before re-deriving an architecture decision or re-debugging
  a non-obvious issue, check `projects/geo/index.md` there.
- **Write path:** durable insights go through `/curate-knowledge` (gated) —
  never write vault articles directly.
<!-- wire-vault:end -->
