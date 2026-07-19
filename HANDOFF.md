# Handoff — Geo round 2: PRD locked, prd.json ready for competing agents

_Updated 2026-07-19 · session end_

## Goal

Turn the retention research + a 12-thought design session into an
executable round-2 plan: score economy with clock-as-pacer, hacker-
cohesive UI + end-of-round breakdown, retention layer (trophy map,
heatmap, freezes, local-date rollover, save code). Multiple agents will
run `prd.json` on separate Orca branches; best result promoted to
`ui-updates`.

## Current state

- **Wrap-around-neighbor label bug FIXED & verified** (Geo #9 Luxembourg:
  FRANCE label dead-center): `visiblePointsBounds()` in
  `src/lib/geo/pathBounds.ts` (in-frame vertex bbox, clip fallback) +
  locator rings now require 2+ landmass clusters (`scene.ts`). 128/128
  tests, typecheck, pixel-verified both mid-round and post-round via
  Playwright screenshots on `?date=2026-07-19`.
- **`prd-geo-round-2.md` + `.html`** — full PRD (3 milestones,
  binding theme guardrails, 7 open questions with defaults).
- **`prd.json`** — 20 dependency-ordered stories (US-001…020), validated
  0 errors; US-020 is the judging evidence package. Old
  `loop/geo-daily-quiz` progress archived to
  `archive/2026-07-19-geo-daily-quiz/`; `progress.txt` reset.
- **`PRD-round2.notes.md`** — decision record (12 raw thoughts + 7 grill
  decisions). Keep: it's the "why" behind the PRD.

## Next steps

1. Launch the competing agents on `prd.json` via Orca (user drives).
2. When branches return: judge on US-020's evidence packages
   (four-outcome screenshot sets, both viewports, multi-day freeze
   sequence) + full test suite.
3. Post-competition: human review pass over generated `fun_fact` data
   (US-010 flags needs-review); settle the 7 PRD open questions that
   playtesting can now answer.

## Key decisions (and why)

- **All economy moves to score; clock is a fixed 60s pacer** — sudden
  death + time-draining penalties conflict with the calm-ritual
  retention evidence; score events give the engagement surface Randy
  wants. Soft zero → "lockout mode": 5 wrong-guess budget after 0:00;
  outcomes: solved / solved_late / locked_out / gave_up (late solves
  extend streak + fill map at a lower tier).
- **Zoom: −10/step, −100 hard cap, pay-once, never time** (thought 10).
- **Map/heatmap split** — world map = trophy collection, solves only,
  failures leave no trace; GitHub-style heatmap = honest per-day ledger
  (incl. failed/frozen cells). Resolved the "what does failure mark?"
  fork.
- **Freezes: 1 per 5 consecutive solved days (late counts), bank 2,
  auto-apply, kind break framing.** No login — save code instead
  (export/import string; future Supabase payload).
- **Local-date rollover, clean flip, no shim** (player base ~1).
- **Theme guardrails binding on all agents**: "clean modern terminal
  cracking a system in real time"; current monochrome identity is the
  base; no green-rain/CRT/skulls; single green accent.
- **Process:** Randy prefers raw thought-capture + discussion over
  option-menu grilling (saved to memory).

## Open questions / risks

- The 7 PRD open questions (fun-fact timing, tuning values, day-number
  epoch, lockout share encoding, heatmap colorblind glyphs, freeze
  apply semantics, fun-fact review bar) — each has a shipping default
  in the relevant prd.json story's notes.
- WorldMapLayer perf debt (unmemoized, 3×-tiled) meets new load in
  US-009/US-018 — both stories carry perf criteria.
- `PRD.html` (old original-PRD render) is deleted in the working tree —
  deletion happened outside this session's edits; committed as part of
  the round-2 sweep.

## Files & commands in play

- `prd-geo-round-2.md` / `.html`, `prd.json`, `PRD-round2.notes.md`,
  `progress.txt`, `archive/2026-07-19-geo-daily-quiz/`.
- Label fix: `src/lib/geo/pathBounds.ts`, `scene.ts`, + tests.
- Research: vault `research/synthesis/daily-retention-loops-geo-game.md`.
- Commands: `npm run dev` / `typecheck` / `test -- --run` / `build`;
  playtest `http://localhost:5173/?date=YYYY-MM-DD`; screenshots via
  python Playwright (`/Library/Frameworks/Python.framework/Versions/3.13/bin/python3`
  — node playwright is NOT installed).

## Git state

Branch `ui-updates` @ `f23161e` at handoff time. Committed during
handoff: label/ring fix + round-2 PRD artifacts + pre-existing
modifications (ideas.md, src/index.css, PRD.html deletion). No remote
configured — push impossible until one is added.

## Don't redo

- All prior handoffs' "Don't redo" items stand (zoom controls top-left,
  scrollWidth check invalid here, island-day size decision, Three.js
  shelved — see git history of this file).
- Don't re-anchor neighbor labels on bbox clips — wrap-around neighbors
  degenerate to frame-center (regression-tested).
- Don't reintroduce time-based penalties anywhere in round 2 — the
  economy decision is locked in the PRD.
- Don't grill Randy through AskUserQuestion option menus for design
  work — raw capture file + discussion.
