# Handoff — Geo: playtesting session (UI polish, zoom/pan, scoring)

_Updated 2026-07-13 · session refresh checkpoint_

## Goal

Playtest the "geo" daily geography guessing game end to end in a real
browser, fixing bugs and adding polish/features as they surface. This is
an ongoing iterative playtesting loop, not a single feature build — the
overarching goal is a shippable, well-tuned v1 per `CLAUDE.md`/`PRD.md`.

## Current state

Everything below is implemented, typechecked, tested (99 tests passing),
built, and verified live via the `automate-browser` skill this session.
**Nothing is committed** — this is one long uncommitted working tree on
branch `loop/geo-daily-quiz` (see Git state).

- **Map centering fix**: `.outline-demo` shifts by `(topPanelHeight -
  bottomPanelHeight) / 2` (measured via refs + `useLayoutEffect` in
  `App.tsx`) so the map stays centered in the actual clear gap between
  the pinned top/bottom UI panels, not the raw viewport (which drifts
  once the bottom panel grows on round-end).
- **Keyboard keycaps** (`src/index.css` `.keyboard__key*`): flat white
  keys, Geist Mono normal weight, 1px light-gray ring, soft gray outer
  drop shadow, bottom inset shadow for depth. Iterated several times
  before landing here — see "Don't redo" below.
- **Fonts**: Geist (sans) + Geist Mono both self-hosted as static
  `.woff2` files under `src/assets/fonts/` (extracted from a throwaway
  `npm install geist` then immediately uninstalled — that package is a
  `next/font` wrapper and drags in all of Next.js if left installed).
  Geist is the site-wide default; Geist Mono is used for the keyboard,
  neighbor labels, and the in-outline solved-country label.
- **Trivia** (`src/data/trivia.json`, 240 entries): rewritten from flat
  declarative facts into genuine questions (all end in `?`), verified
  spoiler-safe (no entry names its own country). Also now stays visible
  for the whole round AND after it ends (`showTrivia` in
  `useGameRound.ts` is now just `true`).
- **Target name display** (`display-name` in `App.tsx`): boxed/segmented
  letter cells (OTP-style), not underline dashes — per-word bordered
  groups via `splitIntoWordGroups`, driven by `DisplayChar[]` from
  `useGameRound`.
- **Solved-country label**: renders INSIDE the target's outline (SVG
  `<text>` centered on `ZOOM_ORIGIN_X/Y`), same font size as neighbor
  labels (`NEIGHBOR_LABEL_PX`), only on `status === "solved"`
  (spoiler-safe). **Explicitly NOT** duplicated into the round-outcome
  text — see "Don't redo".
- **World map + zoom + drag-to-pan** (`WorldMapLayer`, `zoom.ts`,
  `App.tsx`): full backdrop of every country, ocean hatch texture,
  radial-gradient reveal centered on target, zoom-out costs a flat
  per-step time penalty + a one-time world-reveal surcharge. Zoom stays
  usable after the round ends (no penalty once the clock has stopped —
  `clock.applyPenalty` no-ops when not running). **+/- zoom buttons**
  (bottom-right, same per-click cost as one scroll step via
  `BUTTON_ZOOM_DELTA = ZOOM_STEP / ZOOM_SENSITIVITY`). **Drag-to-pan** is
  elastic, not persistent: bounded to a radius tied to current zoom
  (`PAN_RADIUS_FACTOR`, disabled entirely at `ZOOM_MIN`), and snaps back
  to center on pointer-up via a `.pan-snap` CSS transition applied to a
  dedicated pan-only `<g>` wrapper (kept separate from the zoom `<g>` so
  scroll/pinch zoom stays instantly responsive, never animated).
- **Correct-streak time bonus** (`clock.ts`, `useGameRound.ts`): every
  `CORRECT_STREAK_BONUS_INTERVAL` (2) consecutive correct letter guesses
  grants `CORRECT_STREAK_BONUS_SECONDS` (2s), via `clock.applyBonus`
  (clamped at the round's starting duration so it can't bank time
  indefinitely). Streak resets to 0 on any wrong guess.
- **Scoring** (`src/lib/game/score.ts`, new): `score = 500 +
  remainingSeconds × 10`, live the whole round (not just on solve —
  ticks with the clock, jumps on bonus/penalty events), force-zeroed
  only on failure. Absolute max = **1,100** (solve with the full 60s
  intact). Displayed always-visible, fixed top-right
  (`.score-display`), with a floating `+20`/`-150` popup per discrete
  event (`ScoreEvent` from `useGameRound`, NOT fired for ordinary
  per-tick decay) that fades over 1.2s.
- **Confetti**: `canvas-confetti` (new dep, ~3kb, zero deps — checked
  against dependency discipline first, nothing existing covered this)
  fires once per round on a genuine solve, guarded by a ref so it can't
  double-fire.
- **Dot-matrix countdown clock** (`DotMatrixNumber` component +
  `src/lib/ui/digitGlyphs.ts`, new): replaced the plain `"60s"` text with
  a real 5×7-dot arcade-scoreboard readout, zero-padded to 2 digits.
  Restyled from an initial amber/orange pass to the app's actual neutral
  black/white/gray theme (white lit dots with a soft white glow, dark
  gray bezel) after user feedback.
- **README.md** (new): project overview, run commands, and a full
  Scoring section (formula, bonus/penalty table in both seconds and
  points, the 1,100 ceiling).
- **ideas.md** (new): parking lot for social sharing on solve
  (deliberately tabled — needs a real design pass on what content is
  actually shared).
- **PRD.md roadmap**: added a **B2** entry for social login (Twitter/X,
  Facebook) tied to score/streak persistence, depends on Supabase
  landing first.

## Next steps

1. **CLAUDE.md is stale** — its "locked mechanics" section predates this
   whole session's zoom/pan, streak bonus, live score, dot-matrix clock,
   and confetti work. User was told this and hasn't yet said whether to
   fold it in — ask, or just do it, next session.
2. **Commit the working tree.** This has been one long uncommitted
   session across many playtesting rounds — user has repeatedly
   deferred this ("keep testing") every time it's been raised. Ask
   again, or propose a sensible commit split (e.g. one commit per
   feature area) if they'd rather not do one giant commit.
3. Nothing else is blocked — the last few turns were all
   implement→verify→ship, no open implementation threads.

## Key decisions (and why)

- **Score is a rescale of `remainingSeconds`, not a second bookkeeping
  system.** `score = 500 + remainingSeconds × 10`. Every bonus/penalty
  already just adds/subtracts seconds on the one clock, so score derives
  from it rather than tracking a parallel currency. User explicitly
  chose this over a decoupled points system (weighed: rescale = simpler,
  always-in-sync; decoupled = more independently tunable, more
  bookkeeping). Confirmed via `AskUserQuestion`.
- **Drag-to-pan is bounded AND elastic**, not free/persistent. Chosen
  specifically to prevent a free way to peek at zoomed-in detail far
  from the target without ever crossing a zoom-out penalty threshold —
  bounded via `PAN_RADIUS_FACTOR` (radius grows only as you zoom out;
  zero at `ZOOM_MIN`). The elastic snap-back-on-release behavior was a
  *later, separate* user request on top of the already-bounded pan —
  don't conflate the two decisions.
- **Solved-country name lives ONLY inside the outline**, not duplicated
  anywhere else. User tried a "move it to a two-line Solved!/Germany
  layout in the bottom panel" alternative, explicitly reverted it
  ("wanted the name... inside the fucking border"). Don't reintroduce
  that alternative without being asked again.
- **`npm install geist` is banned** — it's a `next/font/local` wrapper,
  not a plain font package, and pulls in all of Next.js. Both Geist
  fonts were extracted via a throwaway install → copy `.woff2` →
  immediate uninstall. This is now a durable vault gotcha (see vault
  section below) — don't re-learn this the hard way in a future session.
- **`canvas-confetti` was a deliberate, checked dependency add** — no
  existing dependency (Framer Motion included) does particle-burst
  confetti, and hand-rolling it would be more code than the ~3kb
  zero-dep library. Consistent with the project's "check native → check
  installed → then reach for a new dep" discipline.

## Open questions / risks

- CLAUDE.md/PRD.md's originally-"locked" mechanics have drifted
  significantly from what's actually implemented (see Next steps #1).
- None of this session's work is committed yet — real risk of loss if
  something goes wrong before a commit happens.
- Exact tuning values (penalty tiers, bonus size/interval, score
  multiplier, pan radius factor) are all still first-guess constants,
  not playtested/validated at scale.

## Files & commands in play

- Branch: `loop/geo-daily-quiz`
- `npm run dev` / `npm run typecheck` / `npm run test -- --run` / `npm run build`
- Key files touched this session: `src/App.tsx` (heavily),
  `src/index.css`, `src/lib/game/{clock,zoom,score,useGameRound,useNeighborReveal,neighborReveal,dailyCountry}.ts`,
  `src/lib/geo/scene.ts`, `src/components/{WorldMapLayer,DotMatrixNumber,CountryOutline,NeighborsLayer}/`,
  `src/lib/ui/digitGlyphs.ts`, `src/data/trivia.json`, `README.md`,
  `ideas.md`, `PRD.md`, `package.json`/`package-lock.json` (canvas-confetti added).

## Git state

Branch `loop/geo-daily-quiz`. Uncommitted (deliberately left — user has
repeatedly chosen to keep playtesting over committing):

```
 M .claude/current-task.txt
 M CLAUDE.md
 M HANDOFF.md
 M PRD.md
 M package-lock.json
 M package.json
 M src/App.tsx
 M src/components/CountryOutline/CountryOutline.tsx
 M src/components/NeighborsLayer/NeighborsLayer.tsx
 M src/data/trivia.json
 M src/index.css
 M src/lib/game/clock.test.ts
 M src/lib/game/clock.ts
 M src/lib/game/dailyCountry.ts
 M src/lib/game/neighborReveal.test.ts
 M src/lib/game/neighborReveal.ts
 M src/lib/game/useGameRound.ts
 M src/lib/game/useNeighborReveal.ts
 M src/lib/geo/scene.test.ts
 M src/lib/geo/scene.ts
?? .claude/handoff-archive/
?? README.md
?? ideas.md
?? src/assets/
?? src/components/DotMatrixNumber/
?? src/components/WorldMapLayer/
?? src/lib/game/score.test.ts
?? src/lib/game/score.ts
?? src/lib/game/zoom.test.ts
?? src/lib/game/zoom.ts
?? src/lib/ui/
```

## Don't redo

- **Keyboard keycap styling** went through several wrong turns before
  landing right: dark keys with a heavy 3D glossy bevel (rejected — "not
  flat"), then a flat dark version (rejected — "keycaps are white"),
  then white with too-heavy shadows, then a 3px gray ring (rejected —
  "too thick, make it 1px"). Final state: flat white, 1px ring, gray
  outer shadow, bottom inset shadow, Geist Mono normal weight. Don't
  cycle back through the rejected variants.
- **Solved-country label placement**: tried moving it out of the outline
  into a two-line "Solved! / Germany" bottom-panel layout — explicitly
  reverted. It stays inside the outline. See Key decisions above.
- **Dot-matrix clock color**: first pass used amber/orange (matching the
  literal reference screenshot the user showed), explicitly rejected —
  "needs to match our theme... neutral blacks, whites, and grays." Now
  white-on-dark-gray. Don't reintroduce amber.
