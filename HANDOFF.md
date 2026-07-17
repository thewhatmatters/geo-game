# Handoff — Geo: Three.js exploration shelved; CLAUDE.md reconciled

_Updated 2026-07-14 · session end_

## Goal

Ongoing playtesting/polish loop toward a shippable v1 (per CLAUDE.md /
PRD.md). This session had two arcs: (1) reconcile the stale CLAUDE.md
with what's actually implemented, and (2) research + spike + **decide
against** a Three.js 2.5D map migration.

## Current state

Branch `loop/geo-daily-quiz`, HEAD `b957e23`, **working tree clean**,
typecheck ✓, 99/99 tests ✓, build ✓. Not pushed anywhere. Dev server
not running (was killed at session end; `npm run dev` to restart).

Two commits this session:

- `1e2e59c` — CLAUDE.md reconciled with reality: zoom/pan mechanic,
  live score, correct-streak bonus, dot-matrix clock all documented as
  locked mechanics; real architecture map + npm commands replace the
  "nothing scaffolded yet" placeholders; scrollWidth gotcha added;
  `/curate-knowledge` → `/curate-vault` reference fixed. Also synced
  HANDOFF.
- `b957e23` — the shelved Three.js exploration record:
  `docs/research/research-threejs-migration-geo.md` (+.html, 26
  sources), `prd-3d-migration.md` (+.html) headed by a **SHELVED**
  status note, and `ideas.md` gained an "SVG depth-cue polish" section.

## The big decision this session (don't relitigate)

**geo's map stays SVG — the 2.5D Three.js direction was researched,
spiked end to end, PRD'd, and then deliberately shelved the same day.**
The user compared the tuned spike against the current game and
preferred the original. Why (full record in `prd-3d-migration.md`'s
status note + vault decision
`projects/geo/decisions/map-stays-svg-3d-shelved.md`):

- Outline fidelity IS the game; the tilted camera foreshortens shapes.
- The draw-on line doubles as the clock; a rising slab breaks that and
  leaks the full shape early (hint-economy regression).
- 3D wow front-loads (first ~10s); mobile perf/battery/bundle/migration
  costs are permanent.

The spike (`src/spike/`) and deps (`three`, `@react-three/fiber`,
`@types/three`) were **removed without ever being committed** — do not
look for them in history; the record is the documentation. The working
CSS3D-label technique from the spike survives ONLY in the vault
playbook `web/css3drenderer-perspective-dom-labels.md`.

## Next steps

1. **SVG depth-cue polish** is the actionable takeaway, parked in
   `ideas.md`: soft shadow under the target outline, lift-and-settle on
   solve, gentle parallax on drag-pan, richer post-draw fill. Each is
   afternoon-sized, independent, no new deps. This answers the user's
   original "UI could be more appealing" itch within the SVG stack —
   likely the next thing they pick up.
2. Carried over, still open: streak-multiplier tier values
   (illustrative only, in `ideas.md`); mobile landscape/tablet
   playtest pass (portrait 320–393px was verified earlier, wider
   viewports never checked).
3. Nothing is blocked.

## Other decisions this session

- **Radial opacity fade** was demoed in the spike as the 3D zoom-reveal
  answer (vs a real spotlight — lights can't gate hints because line
  materials are unlit). Moot for the shelved migration, but the
  reasoning is captured in the vault gotcha if 3D ever returns.
- A design grill on the migration PRD was started and ended after Q1
  when the comparison prompted the shelving — the PRD's remaining open
  questions are all moot.

## Files & commands in play

- `npm run dev` / `npm run typecheck` / `npm run test` / `npm run build`
- New this session: `docs/research/research-threejs-migration-geo.md`,
  `prd-3d-migration.md` (SHELVED), `ideas.md` §"SVG depth-cue polish".
- Vault articles written (via curate-vault, all verified):
  `projects/geo/decisions/map-stays-svg-3d-shelved.md`,
  `web/css3drenderer-perspective-dom-labels.md`,
  `web/webgl-weak-primitives-lines-and-text.md`. The user hand-tweaked
  the two web/ articles afterward (added cross-links to the shelving
  decision) — those edits are intentional, keep them.

## Git state

Branch `loop/geo-daily-quiz`, clean at `b957e23`. Not pushed.

## Don't redo

- Everything in prior handoffs' "Don't redo" still applies (zoom
  controls stay top-left; scrollWidth is not a valid overflow check in
  this repo; keyboard/clock styling is settled).
- **Don't re-propose the Three.js migration** — shelved with a
  documented decision; reopening needs the user's explicit call.
- **Don't decompose `prd-3d-migration.md`** — it's a SHELVED record,
  not an active plan, and says so in its header.
- CLAUDE.md is NO LONGER stale — the multi-session "fold the new
  mechanics in" thread is resolved as of `1e2e59c`.
