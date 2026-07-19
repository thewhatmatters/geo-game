# Ideas (parking lot)

Things worth doing eventually, deliberately not scoped or designed yet —
notes to pick up later, not commitments.

## Social sharing on solve

A dedicated share-to-social action when a round is solved, beyond the
existing spoiler-safe copy-to-clipboard share string (`ShareResult`).
Rough shape, needs real design before building:

- Likely the native Web Share API (`navigator.share`) where available,
  falling back to direct intent links (X/Twitter, Facebook) or the
  existing clipboard copy — same layered-fallback shape the rest of this
  project already uses (e.g. dual-mode skills).
- Probably wants to carry the score (see `src/lib/game/score.ts`) and/or
  the confetti moment as the shareable "hook," not just the existing
  guess-pattern row.
- Ties into the already-flagged **B2** roadmap item in `PRD.md`
  (social login) — sharing *to* an account vs. sharing a generic link are
  different scopes; this note is about the generic link/share-sheet
  version, which doesn't need an account at all and could ship well
  before B2's login work.
- Needs a decision on what's actually in the shared content (score only?
  country name, only if solved — spoiler-safe rule already established
  elsewhere? a generated image/card, like Wordle's colored-square grid?).

Tabled for now — revisit when there's appetite to actually design it.

## Streak-based score multiplier/bonus

A score bonus for consecutive-day play, reusing the streak tracking that
already exists (`src/lib/streak/`, `useStreak`'s `current_streak` —
already increments on a solve, already resets to 0 on a failure or a
missed day, per `recordRoundOutcome`). No new tracking needed, just a
new bonus table (same "tunable table, not inline arithmetic" shape as
`PENALTY_TIERS` in `clock.ts`) applied against `streak.current_streak`
and added into that day's score once the round resolves.

Draft tiers (illustrative, not final — needs the same playtesting pass
as every other tuning constant in this project), escalating rather than
flat-rate, capped at a 7-day streak so it doesn't grow unbounded:

| Streak length | Bonus |
|---|---|
| 1 day | — (baseline) |
| 2 days | +20 |
| 3 days | +40 |
| 4 days | +70 |
| 5 days | +100 |
| 6 days | +140 |
| 7+ days (cap) | +200 |

**Decided**: the multiplier rides on the existing solve-streak exactly
as-is — it requires solving each day (a failed/given-up round still
zeroes `current_streak`), not a separate "opened the app" concept. No
new state needed. The tier values above remain undecided/illustrative —
only this one facet of the idea has been settled.

## SVG depth-cue polish (salvaged from the shelved 2.5D migration)

The Three.js 2.5D direction was explored, spiked, and deliberately
shelved on 2026-07-14 (full record: `prd-3d-migration.md` status note +
`docs/research/research-threejs-migration-geo.md`). What survives is the
*motivation* — "things raising, more visual appeal" — deliverable as
depth cues in the existing SVG stack, no WebGL, no new deps, each an
afternoon-sized independent task:

- **Soft shadow under the target outline** (SVG `feDropShadow` /
  `feGaussianBlur` filter) — the single cheapest "it's an object, not a
  line drawing" cue.
- **Lift-and-settle on solve** — brief scale-up + shadow-spread + settle
  transform on the solved country; pairs with the existing confetti
  moment.
- **Gentle parallax on drag-pan** — offset the world layer slightly less
  than the target layer while panning (two layers already exist), giving
  cheap depth separation. The pan machinery is already in App.tsx.
- **Richer surface treatment** — subtle SVG gradient or grain on the
  target's post-draw fill instead of the current flat
  `rgba(255,255,255,0.12)`.

Not scoped or committed — same parking-lot status as everything else in
this file.

## Revisit the micro-archipelago day pattern

The 2026-07-17 decision (CLAUDE.md: tininess = intended hardness, rings/
boost/halo accepted, insets rejected) got its first real playtest the same
day — and the user's live reaction was "this one is weird, it's in the
middle of the ocean… we'll need to revisit this pattern." The gauntlet's
findability aids work (rings make the islands locatable), but the overall
*feel* of a two-specks-in-a-void round may need more than findability:
candidates when revisited include the previously-rejected inset
cartouches, an ocean-context treatment (subtle bathymetry/texture at
default zoom so the void reads as "Pacific" rather than "empty"), or
island-day-specific framing copy. Don't reopen without weighing the
existing decision's rationale — but the decision predates real play, and
the first play vote was against the feel.

## Retention roadmap (from the 2026-07-17 deep-research report)

Implementation plan derived from the vault report
`research/synthesis/research-daily-retention-loops-geo-game.md` (74
sources; recommendations section). Sequenced **3 → 2 → 1 → 4 → 5** —
rollover first because every later feature keys localStorage data by
date strings that should be right from the start. More concrete than the
usual parking-lot entry, but still uncommitted until each item gets a
go.

1. **Solved-countries world map** (report's top pick — no competitor
   ships one; players hand-build them). New `src/lib/collection/`
   module, localStorage key `geo:collection`:
   `{ [code]: { solvedOn, secondsLeft } }`, recorded in the same
   App.tsx effect as `recordOutcome` so collection day and streak day
   agree. Render as a fill pass in `WorldMapLayer` (already draws all
   countries via `getAllCountries()`); today's solve animates its fill
   on the end screen + "14 / 193" counter. `secondsLeft` enables
   quality tiers later (NYT gold/blue analogue). **Open decision:** do
   failed days dim-fill or stay blank? **Do first:** memoize
   WorldMapLayer (gauntlet flag — unmemoized and 3×-tiled) before
   adding per-country fill state.
2. **Earned streak freezes + break framing.** Extend
   `streak/index.ts` (stays pure, test-heavy): add `freezes` (cap 2);
   earn 1 per 5 consecutive solves (`current_streak % 5 === 0`);
   freezes cover **missed days only** (where `wasYesterday` fails,
   consume `gap − 1` freezes if affordable), never failed rounds —
   playing-and-failing still resets. On a real reset, return the ended
   streak so the end screen celebrates it ("Your 34-day streak ends —
   your longest yet") instead of showing a silent 0. Whole system must
   fit a two-sentence UI explainer (Duolingo's copy win).
3. **Local-date rollover** (UTC → device-local calendar date,
   Wordle/Worldle model; no leaderboard holds us to UTC). One shared
   `localDateString()` replacing `toIsoString().slice` in
   `dailyCountry.ts`, `streak`, and (via import) `share`'s day number —
   all three must switch together. One-time "today's country" reshuffle
   at transition (do while playerbase is small). Guard the Wordle
   timezone-travel bug: persist last-played `date + targetCode`; if
   boot resolves to an already-recorded date, show the completed
   end-state, not a replayable round. **Amends a CLAUDE.md locked
   mechanic ("hash of UTC date") — needs an explicit yes + CLAUDE.md
   update in the same commit.**
4. **End screen as the retention surface** (composition in App.tsx;
   good Claude-vs-Grok Orca race candidate — self-contained, visually
   judgeable). Adds: countdown to next country at local midnight
   (DotMatrixNumber reuse; only sensible after item 3), streak +
   freeze display with item 2's framing, item 1's map-fill moment.
5. **Timer-keyed badges** (deferred until 1+2 exist). Pure
   `src/lib/badges/` evaluator `(round, collection, streak) →
   newlyEarned[]`, `geo:badges` storage, earn toast (NYT pattern).
   Vocabulary: 30+s solve, zero wrong guesses, no-zoom solve,
   island-day solve, 7/30/100-day streaks, 10/50/100 countries,
   continent complete (needs a continent field — slot with next
   `gen:countries` regen).

**Protect list (no work, just don't undo):** one-a-day hard stop,
spoiler-safe share, bonus-on-top rewards, trivia after failure, no
leaderboard, no notifications. **Metrics for the Supabase milestone:**
share of players at 7+ day streaks; return-within-24h after a streak
break — unmeasurable in the static app, day-one requirements when the
backend lands (streak-fragility gotcha already raised its priority).

## Transcontinental-territory days frame half the planet

Discovered playtesting 2026-07-17: the Netherlands day frames a ~5000-unit
viewBox because Natural Earth's NLD geometry includes the Caribbean
Netherlands — the target-anchored frame spans Europe→Curaçao, the default
"close-up" already shows a third of the world, and maxZoom floors at
MIN_MAX_ZOOM. France (French Guiana/Polynesia), the US (Alaska/Hawaii),
and other far-flung-territory countries will behave the same. Same family
as the micro-archipelago question: bbox framing vs. scattered geometry.
Candidate fix: frame on the LARGEST landmass cluster (clusterCenters
machinery already exists) rather than the full bbox, with the outlying
territories drawn but not framing-relevant. Needs a pass over which
countries are affected before designing.
